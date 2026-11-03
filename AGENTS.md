<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
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
en `PLAN.md`.

---

## Restricciones INVIOLABLES (hardware real de despliegue)

El despliegue es un **QNAP TS-832PX** (ARM Cortex-A57 quad-core @1.7 GHz, **4 GB RAM**,
QTS + Container Station). De ahí salen estas reglas. No son negociables:

1. **ARM64 obligatorio.** Toda imagen Docker se construye para `linux/arm64` con
   `docker buildx --platform linux/arm64`. Ninguna dependencia con binarios nativos sin
   soporte ARM64. Una imagen x86 **no arranca** en el NAS. Verificar ARM64 desde la
   Fase 1, no al final.
2. **El NAS NO tiene salida a internet.** Consecuencias:
   - Despliegue offline: el CI publica la imagen a GHCR **y además** como artefacto
     `.tar` (`docker save`) que se copia al NAS por SMB y se carga con `docker load`.
   - **Cero dependencias externas en runtime**: nada de CDNs, Google Fonts, íconos
     remotos, telemetría. Fuentes e íconos van empaquetados en la imagen.
     `NEXT_TELEMETRY_DISABLED=1`.
3. **Presupuesto de RAM: ~2 GB para contenedores** (QTS consume el resto de los 4 GB).
   Límites de memoria explícitos en el compose (app ≤ 768 MB, Postgres ≤ 512 MB).
   **Prohibido**: Elasticsearch, Meilisearch, Redis, Puppeteer/Chromium en el NAS, o
   cualquier servicio adicional. Solo dos contenedores: app + Postgres.
4. **Los datos de PostgreSQL jamás en carpeta SMB/CIFS** (se corrompen). Volumen local
   sobre el storage pool. Los archivos de documentos sí van en carpeta compartida del
   NAS montada como bind mount (los cubren los snapshots).
5. **Puertos 8080 y 443 los ocupa QTS.** La app usa puerto alto (3080 interno → publicado
   en el host como 9080). Reverse proxy y TLS: los **nativos de QTS**, no un contenedor.
6. **El puerto de PostgreSQL nunca se expone al host.** Solo red interna de Docker.

## Reglas de negocio INVIOLABLES (ISO 9001 — 7.5)

1. **Un documento tiene UNA sola versión vigente.** Publicar una versión nueva pasa la
   anterior a `obsoleto` automáticamente, **en la misma transacción**. Se refuerza con
   índice único parcial en BD (`WHERE estado = 'vigente'`), no solo en código.
2. **Las versiones obsoletas se retienen, nunca se borran.** El admin las ve marcadas con
   evidencia visual inequívoca (banda/watermark "OBSOLETO").
3. **El endpoint público jamás sirve documentos no vigentes** (ni borradores, ni
   obsoletos, ni anulados). Toda query pública filtra por `estado = 'vigente'`.
4. **El acceso público es estrictamente de solo lectura.** Ninguna ruta de escritura sin
   sesión de administrador autenticada. Cualquier cambio en rutas se audita contra esta
   regla.
5. **Trazabilidad completa:** toda acción del admin (crear, publicar, dar de baja, editar
   mapa) queda en la bitácora de auditoría con quién, qué y cuándo.
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
| BD | PostgreSQL 16, imagen oficial ARM64 (`postgres:16-alpine`) | Extensiones: `unaccent`, `pg_trgm` |
| ORM | **Drizzle** | TS puro, sin engine binario (evita el riesgo ARM de Prisma), SQL-first para FTS |
| Búsqueda | FTS nativo de Postgres: `to_tsvector('spanish', ...)` + `pg_trgm` + `unaccent` | Sin motores externos |
| Auth (solo admin) | Sesión propia: cookie httpOnly + tabla `sesiones` + **Argon2id** (`@node-rs/argon2`, tiene prebuilds ARM64) | Un solo usuario admin. Sin OAuth (no hay internet). Lucia está deprecado; Auth.js es sobredimensionado aquí |
| Archivos | Filesystem del NAS (bind mount) + metadatos en Postgres | Nunca BLOBs en BD |
| Detección MIME | `file-type` (magic bytes, JS puro) | |
| Export Excel | `exceljs` (JS puro) | Listado Maestro |
| Export PDF | Hoja de estilos de impresión (`window.print`) | Prohibido Puppeteer en el NAS |
| Rate limiting | En memoria, en la app (instancia única) | Sin Redis |
| CI/CD | GitHub Actions → build `linux/arm64` → GHCR + artefacto `.tar` para carga offline | Repo en cuenta personal de GitHub (`juanfyru/sgc-integral`). En esta variante el job ARM64 se lanza **a mano** (Run workflow); lint+build corren en cada push |

## Convenciones de código

- **Idioma:** dominio y UI en español (entidades, columnas, rutas, textos). Código
  (variables, funciones) en español consistente con el dominio: `documento`, `proceso`,
  `versionVigente`. Comentarios solo cuando el código no puede expresar la restricción.
- **TypeScript estricto** (`strict: true`). Sin `any` salvo justificación puntual.
- **Estructura:** App Router con rutas públicas en `app/(publico)` y admin en
  `app/admin`. Lógica de datos en `src/db` (schema Drizzle + queries), lógica de negocio
  en `src/lib`. Server Components por defecto; `'use client'` solo donde hay
  interactividad.
- **Migraciones versionadas con Drizzle Kit**, ejecutadas en el arranque del contenedor.
  Nunca `db push` contra producción.
- **Accesibilidad no negociable:** navegable por teclado, foco visible, contraste AA,
  SVG del mapa con roles/etiquetas ARIA. El ícono de formato de archivo nunca es la
  única señal (siempre etiqueta textual + tamaño, `aria-label`).
- **Seguridad en cada PR que toque rutas:** verificar que ninguna ruta de escritura quede
  fuera del guard de sesión. Cabeceras CSP, `X-Content-Type-Options`, `X-Frame-Options`
  en `next.config`/middleware.

## Comandos

```bash
npm run dev          # desarrollo local (requiere Postgres local: docker compose -f docker-compose.dev.yml up -d)
npm run build        # build de producción (standalone)
npm run lint         # ESLint + tsc --noEmit
npm test             # tests (Vitest)
npm run db:generate  # generar migración desde el schema Drizzle
npm run db:migrate   # aplicar migraciones
npm run db:seed      # datos semilla (mapa real + documentos ficticios verosímiles)
```

Build de imagen (local, para verificar ARM64):

```bash
docker buildx build --platform linux/arm64 -t sgc-integral:local .
```

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
