# Fase 6 — Auth + panel admin: carga y versionado (diseño aprobado)

> Aprobado por el usuario el 2026-07-16, sección por sección. Reglas permanentes en
> `AGENTS.md`; estado vivo en `CONTEXT.md`; fase definida en `PLAN.md` §Fase 6.

## Decisiones del usuario (clarificación)

1. **Flujo de publicación:** guardar borrador → publicar (botón aparte con
   confirmación). Nada llega al público sin ese segundo paso.
2. **Tamaño máximo por archivo:** 25 MB.
3. **Cuenta admin:** se crea desde variables de entorno al arranque
   (`ADMIN_USUARIO`/`ADMIN_CLAVE`, script idempotente); reseteo de clave con el
   mismo script ejecutado en el NAS.
4. **Alcance:** ciclo completo de versionado — carga, publicar, **anular** y
   **editar metadatos** entran en esta fase.
5. **Mecanismo de mutación (opción B):** Server Actions para formularios;
   route handler multipart dedicado, con streaming a disco, para la subida de
   archivos. El `bodySizeLimit` de 1 MB de las actions NO se toca.

## Arquitectura y rutas

```
src/proxy.ts                                  ← guard optimista (Next 16: proxy, no middleware)
src/app/admin/
  ingreso/page.tsx                            ← login (única ruta admin sin sesión)
  layout.tsx                                  ← valida sesión REAL contra BD + nav del panel
  page.tsx                                    ← tabla de documentos con estados y marca visual
  documentos/nuevo/page.tsx                   ← crear documento (metadatos + asociaciones)
  documentos/[codigo]/page.tsx                ← detalle: versiones, archivos, publicar/anular/editar
  documentos/[codigo]/versiones/nueva/page.tsx← nueva versión (borrador)
  api/archivos/route.ts                       ← POST subida multipart (streaming)
src/lib/sesion.ts                             ← tokens, cookie, requerirSesion()
src/app/admin/acciones.ts                     ← Server Actions (login, crear, publicar, anular, editar)
src/db/consultas/admin.ts                     ← queries del panel
scripts/asegurar-admin.ts                     ← crea el admin desde env si no existe; --forzar-clave resetea
```

**Guard en dos capas.** `proxy.ts` (matcher `/admin/:path*`) solo comprueba que la
cookie exista; sin cookie → redirect a `/admin/ingreso`. Nunca toca la BD. La
validación real (SHA-256 del token contra `sesiones`, usuario activo, expiración)
ocurre en `layout.tsx` del admin y como **primera línea** de cada Server Action y
del route handler (`requerirSesion()`).

**Bootstrap del admin.** `scripts/asegurar-admin.ts` es idempotente: crea el
usuario solo si no existe. Corre en el arranque del contenedor (junto a las
migraciones) y en dev como `npm run admin:asegurar`. `--forzar-clave` restablece
la clave (para olvido, ejecutándolo en el NAS). Documentar que `ADMIN_CLAVE`
puede retirarse del compose tras el primer arranque.

## Auth y sesiones

- **Hash de clave:** Argon2id con `@node-rs/argon2` (prebuild ARM64 verificado en
  CI en esta misma fase — riesgo señalado en PLAN §Riesgos).
- **Token de sesión:** 32 bytes aleatorios → base64url en cookie `httpOnly`,
  `SameSite=Lax`, `Secure` en producción, `path=/`. En BD solo su SHA-256
  (columna `sesiones.id`, ya prevista en el esquema).
- **Vigencia:** 12 h con renovación deslizante (si quedan <6 h al validar, se
  extiende). Limpieza oportunista de sesiones expiradas al validar.
- **Login:** rate limit con `crearLimitador` existente (5 intentos/min/IP);
  mensaje de error único que no revela si el usuario existe; `auditoria` registra
  ingreso y cierre de sesión.

## Flujo de carga y versionado

**Crear documento.** Formulario de metadatos: código validado contra el patrón
provisional configurable (`^[A-Z]{2,4}-[A-Z]{2,4}-\d{3}$` en `configuracion`,
ajustable sin migración cuando llegue la convención oficial), título, tipo,
descripción, palabras clave, asociaciones M:N al mapa con exactamente una
principal (coherente con la sigla del código). Crea documento + versión 1 en
`borrador`. Auditado.

**Subida de archivos.** Dropzone multiarchivo (client component) con progreso por
archivo. Cada archivo → POST multipart a `admin/api/archivos`. Validación en
orden: sesión → `Origin` = host (CSRF) → versión existe y está en `borrador` →
tamaño ≤ 25 MB (rechazo por `Content-Length` y corte del stream si miente) →
allowlist con **magic bytes** (`file-type`) coherentes con la extensión. La
allowlist concreta: `pdf`, `docx/xlsx/pptx`, legados `doc/xls/ppt`, imágenes
`png/jpg/jpeg/webp`, comprimidos `zip/rar`. Todo lo demás (ejecutables incluidos)
se rechaza. Escritura por streaming a
`almacen/documentos/<codigo>/v<numero>/<nombre-saneado>` con SHA-256 al vuelo
(nunca el archivo entero en RAM); fila en `archivos` con rol
principal/editable/anexo. La subida requiere JS; los formularios de metadatos no.

**Regla de simplicidad:** a lo sumo UNA versión en `borrador` por documento
(validado en código al crear versión).

**Publicar.** Botón con confirmación explícita. Prevalida archivo principal +
evidencia de aprobación (aprobó y fecha; el CHECK de BD lo exige igualmente). En
una sola transacción: vigente actual → `obsoleto`, borrador → `vigente`,
auditoría. Después, `revalidatePath` de las rutas públicas afectadas.

**Anular.** Vigente → `anulado` (sale de circulación sin reemplazo), con
confirmación y auditoría.

**Editar metadatos.** Título, descripción, palabras clave y asociaciones siempre
editables (auditoría con detalle del cambio). El **código** solo es editable
mientras el documento nunca haya sido publicado; después es identidad inmutable.

**Marca visual (regla ISO 2).** Badges por estado (borrador ámbar, vigente verde,
obsoleto gris, anulado rojo); versiones obsoletas/anuladas con banda diagonal
"OBSOLETO"/"ANULADO" inequívoca en el admin.

## Manejo de errores y seguridad

- **Actions:** retorno tipado `{ ok: true } | { ok: false, error: string }` con
  `useActionState`; los errores se muestran en el formulario sin perder lo
  escrito. Validación manual ligera (sin dependencia nueva). `requerirSesion()`
  primero, siempre.
- **Handler de subida:** `401` sin sesión, `403` Origin inválido, `404` versión
  inexistente, `409` versión no-borrador, `413` >25 MB, `415` formato no
  permitido o magic bytes incoherentes. Cuerpo JSON uniforme `{ error }`.
- **Superficie de escritura total:** las actions de `acciones.ts` + el handler.
  Nada más escribe. La CSP existente no se relaja; páginas admin dinámicas con
  `no-store`.

## Testing

1. `tests/sesion.test.ts` — Argon2id verifica/rechaza; ciclo de sesión
   (crear/validar/renovar/expirar) contra BD dev; en BD nunca está el token.
2. `tests/publicar.test.ts` — publicar deja exactamente una vigente y la anterior
   obsoleta en la misma transacción; publicar sin aprobación o sin archivo
   principal falla; anular; segundo borrador simultáneo rechazado.
3. `tests/subida.test.ts` — saneamiento de nombres, allowlist, magic bytes vs
   extensión (PDF renombrado a .docx se rechaza; reutiliza placeholders Fase 4).
4. `tests/guardia.test.ts` — auditoría de rutas: toda action sin sesión falla;
   handler sin cookie → 401; `/admin/*` sin cookie → redirect a ingreso.
5. CI: smoke test de que `@node-rs/argon2` carga su prebuild en `linux/arm64`.

**Demo de cierre:** login → crear documento → drag & drop de PDF+DOCX → publicar
→ verlo vigente en el portal público, con la versión anterior obsoleta e
invisible al público.
