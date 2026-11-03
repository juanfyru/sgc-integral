# Fase 11 — Fundación de acceso (diseño de detalle)

> Deriva del diseño maestro aprobado el 2026-11-03
> (`2026-11-03-sgc-integral-plataforma-design.md`, en adelante "el spec"), §5.1, §5.2,
> §5.3, §5.9, §5.10 y §8 Fase 11. Este documento fija lo que el spec deja al
> constructor para esta fase: columnas, flujos, variables de entorno, valores y rutas.
> El plan ejecutable está en `docs/superpowers/plans/2026-11-03-fase11-fundacion-acceso.md`.
> Estado: **en revisión del usuario junto con el plan**.

## 1. Alcance de la fase

Entra (spec §8 Fase 11): subir Next; `zod`; roles y `usuario_procesos`; áreas y cargos con
jerarquía; usuarios (uno a uno y por lote) con clave temporal, cambio obligatorio,
política de clave, bloqueo por cuenta, TOTP opcional y `EXIGIR_2FA_ROLES`, sesiones
activas con cierre forzado; registro de accesos; aviso de datos personales; login en
toda la app; `permisos.ts` y `alcance()` con tests; dos roles de BD y bitácora
inmutable; `eventos_consulta` con usuario; reescritura de los tests heredados; semilla
mínima y demo; reescritura de `AGENTS.md`.

No entra (queda en su fase): correo y enlaces de activación o restablecimiento (F16),
tema claro/oscuro y marca (F12), nivel de acceso por documento y flujo documental (F13),
tablero (F17).

**Desviaciones del spec, declaradas:** `tokens_un_uso` aparece en §7 bajo F11 pero no
tiene consumidor hasta que exista SMTP: se crea en F16. `usuarios.tema` es de F12. Next
se sube a la **última 16.x** disponible (16.4.4 al escribir esto), no a 16.3.x: mismo
major, misma intención ("antes de código nuevo sobre una versión con avisos").
`scripts/carga.ts` (prueba de carga de F10) recorre rutas sin sesión y dejará de servir
tal cual; se adapta en F19.

## 2. Modelo de datos (migración `0002`)

Nombres definitivos. Convenciones heredadas: `timestamptz`, FK `restrict` salvo donde se
indica, CHECK en BD, identidad `bigint`.

| Tabla | Cambio |
|---|---|
| `usuarios` | `rol text NOT NULL DEFAULT 'consulta'` CHECK en los cinco roles; `correo text` con índice único parcial sobre `lower(correo)` cuando no es nulo; `cargo_id` FK `cargos` (nullable: el admin de arranque no tiene cargo); `jefe_inmediato_id` FK `usuarios` (nullable); `debe_cambiar_clave boolean NOT NULL DEFAULT false`; `intentos_fallidos integer NOT NULL DEFAULT 0`; `bloqueos_consecutivos integer NOT NULL DEFAULT 0`; `bloqueado_hasta timestamptz`; `totp_secreto_cifrado text`; `totp_activo boolean NOT NULL DEFAULT false`; `ver_historial boolean NOT NULL DEFAULT false`; `acepto_datos_en timestamptz`; `actualizado_en timestamptz NOT NULL DEFAULT now()` |
| `areas` (nueva) | `id`, `nombre text UNIQUE`, `orden integer`, `activo boolean DEFAULT true` |
| `cargos` (nueva) | `id`, `nombre text`, `area_id` FK `areas`, `superior_id` FK `cargos` (nullable, auto-referencia), `activo boolean DEFAULT true`; UNIQUE (`area_id`, `nombre`) |
| `usuario_procesos` (nueva) | `usuario_id` FK `usuarios` ON DELETE CASCADE, `proceso_id` FK `procesos`; PK compuesta; índice por `proceso_id` |
| `sesiones` | `ultimo_uso_en timestamptz NOT NULL DEFAULT now()`, `factor_pendiente boolean NOT NULL DEFAULT false`, `ip inet`, `user_agent text` |
| `accesos` (nueva) | `id`, `usuario_id` FK `usuarios` ON DELETE SET NULL, `usuario_texto text NOT NULL` (lo tecleado), `resultado text NOT NULL` CHECK IN (`ingreso`, `salida`, `fallo`, `bloqueo`, `desbloqueo`, `restablecimiento`, `factor_fallo`, `cierre_forzado`), `ip inet`, `user_agent text`, `creado_en`; índices (`usuario_id`, `creado_en`) y (`creado_en`) |
| `codigos_recuperacion` (nueva) | `id`, `usuario_id` FK `usuarios` ON DELETE CASCADE, `hash text NOT NULL`, `usado_en timestamptz`; índice por `usuario_id` |
| `eventos_consulta` | `usuario_id` FK `usuarios` ON DELETE SET NULL |

SQL manual añadido al final de la migración generada:

- `UPDATE usuarios SET rol = 'admin_sgc';` — todo usuario anterior a la Fase 11 era el
  administrador único (cubre la base de desarrollo y la actualización desde
  `sgc-suaza`, spec DC29). En una base vacía no hace nada.
- Función `sgc_impedir_modificacion()` que lanza `RAISE EXCEPTION ... USING ERRCODE =
  '42501'` y triggers `BEFORE UPDATE OR DELETE` en `auditoria` y `accesos`
  (`auditoria_inmutable`, `accesos_inmutable`). Sin puerta trasera: ni la app ni el
  dueño del esquema pueden modificar o borrar filas; los tests dejan de limpiar
  `auditoria` (los registros de prueba referencian usuarios de prueba y quedan como
  "sistema" cuando estos se borran, por `ON DELETE SET NULL`).

## 3. Roles de base de datos (migración `0003`, SQL manual)

- Dos cadenas de conexión: `DATABASE_URL_MIGRADOR` (dueño del esquema; corre migraciones,
  semillas y crea el rol de la app) y `DATABASE_URL` (rol `sgc_app`, el que usa la app).
- El arranque (`scripts/arrancar.ts`) con la conexión del migrador: espera la BD →
  `asegurarRolApp(sql, BD_APP_CLAVE)` → migraciones → admin por entorno. La clave llega
  a `CREATE ROLE`/`ALTER ROLE` por `set_config('sgc.clave_app', $1, true)` dentro de un
  bloque `DO` con `format('%L', current_setting(...))`: el DDL no acepta parámetros y la
  clave nunca se concatena en el texto SQL. El nombre del rol es la constante `sgc_app`.
- Migración `0003_privilegios-sgc-app.sql`: `REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO sgc_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL
  TABLES IN SCHEMA public TO sgc_app; REVOKE UPDATE, DELETE ON auditoria, accesos FROM
  sgc_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sgc_app; ALTER
  DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
  sgc_app; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO
  sgc_app;`. Los privilegios por defecto quedan ligados al migrador, que es quien crea las
  tablas futuras. `TRUNCATE` no se concede: la semilla corre con el migrador.
- **Modo heredado:** si falta `DATABASE_URL_MIGRADOR`, el arranque usa `DATABASE_URL`
  para todo y avisa en consola ("la app corre con el rol dueño"). Así una base de
  `sgc-suaza` restaurada arranca aunque su compose no traiga las variables nuevas; el
  manual técnico pide configurarlas. Si falta `BD_APP_CLAVE` se omite la creación del rol
  con aviso (igual que `ADMIN_CLAVE` ausente, D40).
- Los tests usan `DATABASE_URL` (rol de la app), como la app. El test de privilegios usa
  además `DATABASE_URL_MIGRADOR` para probar que el trigger frena también al dueño.

## 4. Variables de entorno

| Variable | Uso | Desarrollo (`.env.example`) | Producción |
|---|---|---|---|
| `DATABASE_URL` | Conexión de la app (`sgc_app`) | `postgres://sgc_app:sgc_app_dev@localhost:5435/sgc` | Obligatoria |
| `DATABASE_URL_MIGRADOR` | Dueño del esquema | `postgres://sgc:sgc_dev@localhost:5435/sgc` | Obligatoria (modo heredado si falta) |
| `BD_APP_CLAVE` | Clave del rol `sgc_app`, sincronizada en cada arranque | `sgc_app_dev` | Generada al instalar |
| `APP_SECRETO` | 32 bytes en base64; cifra los secretos TOTP en reposo (AES-256-GCM). Es el `SESION_SECRETO` que nombra el spec §5.9 fila 19; se llama así porque no firma sesiones (los tokens son aleatorios) sino que cifra secretos | Si falta, clave fija de desarrollo con aviso en consola | Obligatoria: el arranque falla si falta con `NODE_ENV=production` |
| `CONFIAR_PROXY` | `1` cuando hay proxy delante (Caddy, F20): la IP se toma de `X-Forwarded-For` (último elemento) o `X-Real-IP`; sin la variable la IP es desconocida | vacío | `1` detrás de Caddy (confirmar el elemento contra la configuración real en F20, spec §11) |
| `SESION_INACTIVIDAD_MIN` | Cierre por inactividad | `60` | `60` (spec DC28) |
| `EXIGIR_2FA_ROLES` | Roles para los que el TOTP es obligatorio, separados por coma | vacío | `admin_sgc,gerencia` cuando se exponga a internet |
| `ADMIN_USUARIO`, `ADMIN_NOMBRE`, `ADMIN_CLAVE`, `ADMIN_FORZAR_CLAVE` | Sin cambios (D40, F10-D4) | | |

`asegurarAdmin` crea el primer administrador con `rol = 'admin_sgc'` y
`debe_cambiar_clave = true`; con `forzarClave` además pone `activo = true`, limpia el
bloqueo y vuelve a exigir el cambio de clave. En desarrollo, tras cada `npm run db:seed`
hay que volver a correr `npm run admin:asegurar` y cambiar la clave al primer ingreso.

## 5. Permisos de la Fase 11

`src/lib/permisos.ts` guarda la matriz como datos. Cada celda tiene un test. El permiso
`documentos.ver_historial` también lo concede la marca individual `usuarios.ver_historial`
(spec DC10).

| Permiso | admin_sgc | gerencia | control_interno | lider_proceso | consulta | Qué abre en esta fase |
|---|---|---|---|---|---|---|
| `panel.entrar` | ✓ | ✓ | ✓ | – | – | El panel `/admin` (la navegación muestra solo lo permitido) |
| `documentos.administrar` | ✓ | – | – | – | – | Crear, editar, versionar, publicar, anular, subir y eliminar archivos |
| `documentos.ver_historial` | ✓ | – | ✓ | (marca) | (marca) | Lista y detalle de documentos del panel con borradores, obsoletos y anulados; vista previa de archivos de cualquier estado |
| `mapa.administrar` | ✓ | – | – | – | – | Editor del mapa, tipos de documento, textos institucionales |
| `maestro.ver` | ✓ | ✓ | ✓ | – | – | Listado Maestro |
| `maestro.exportar` | ✓ | – | ✓ | – | – | Excel del Listado Maestro |
| `estadisticas.ver` | ✓ | ✓ | ✓ | – | – | Estadísticas |
| `bitacora.ver` | ✓ | – | ✓ | – | – | Bitácora |
| `accesos.ver` | ✓ | – | ✓ | – | – | Registro de accesos |
| `usuarios.administrar` | ✓ | – | – | – | – | Usuarios, alta por lote |
| `estructura.administrar` | ✓ | – | – | – | – | Áreas y cargos |
| `sesiones.administrar` | ✓ | – | – | – | – | Sesiones activas y cierre forzado |

El portal de consulta (`/`, `/procesos`, `/documentos`, `/buscar`) lo ven los cinco roles
con sesión: muestra solo versiones vigentes (spec §5.3; el nivel de acceso por documento
llega en F13). Sin permiso para una página del panel, la app redirige a `/sin-acceso`.

## 6. Autenticación y cuenta

**Ingreso (`/ingreso`).** Usuario y clave. Límite por IP de 30 intentos por minuto
**solo cuando la IP es conocida** (con proxy de confianza); el control fino es por
cuenta: al quinto fallo consecutivo la cuenta se bloquea 15 minutos; cada bloqueo
siguiente duplica el tiempo (30, 60, 120 minutos…) hasta un máximo de 24 horas; un
ingreso correcto reinicia ambos contadores. Mensajes: usuario inexistente, inactivo o
clave incorrecta → "Usuario o clave incorrectos" (mismo costo de tiempo, sin
enumeración); clave **correcta** con la cuenta bloqueada → "Cuenta bloqueada hasta las
HH:MM por intentos fallidos; si no fue usted, avise al administrador" (quien demostró la
clave merece saberlo). Cada intento queda en `accesos` con usuario tecleado, IP y
user-agent. El parámetro `volver` solo acepta rutas internas (`/...`, no `//`).

**Segundo factor.** Si la cuenta tiene TOTP activo, el ingreso crea la sesión con
`factor_pendiente = true` y lleva a `/ingreso/verificar`: código de 6 dígitos (ventana
de ±1 periodo de 30 s) o código de recuperación de un solo uso. Cinco fallos de factor
cierran la sesión pendiente y obligan a ingresar de nuevo. Una sesión con factor
pendiente no sirve para nada más (toda acción la rechaza). Al confirmar se registra
`ingreso` en `accesos`.

**Flujos obligatorios tras ingresar**, en este orden, antes de ver cualquier página:
(1) factor pendiente → `/ingreso/verificar`; (2) `debe_cambiar_clave` →
`/cuenta/clave-inicial`; (3) aviso de datos personales no aceptado → `/aviso-datos`;
(4) rol en `EXIGIR_2FA_ROLES` sin TOTP → `/cuenta/segundo-factor?obligatorio=1`. El
layout del portal y el del panel aplican el orden; las acciones de servidor distintas de
estos flujos rechazan una sesión pendiente.

**Política de clave** (al crear o cambiar): entre 12 y 128 caracteres; no está en la
lista de 10 000 claves comunes empaquetada
(`src/lib/datos/claves-comunes.json`, derivada de SecLists `10k-most-common.txt`, MIT);
no contiene el nombre de usuario. Sin caducidad (spec DC7). La clave temporal generada
tiene la forma `XXXX-XXXX-XXXX-XXXX` con un alfabeto sin caracteres ambiguos (sin 0, O,
1, I, L) y se muestra **una sola vez** al administrador.

**Sesión.** Token de 32 bytes, SHA-256 en BD, 12 h deslizantes (D37) **más** cierre por
inactividad: si `ultimo_uso_en` tiene más de `SESION_INACTIVIDAD_MIN` minutos, la sesión
no vale. `ultimo_uso_en` se actualiza como máximo una vez por minuto (no una escritura
por petición). Cambiar la clave cierra las demás sesiones del usuario; desactivar una
cuenta o restablecer su clave cierra todas.

**Mi cuenta (`/cuenta`).** Datos (nombre, usuario, correo, cargo, área, supervisor,
rol, procesos asignados), cambio de clave (pide la actual), segundo factor: activar
(QR como imagen PNG en `data:` URL, permitido por la CSP actual; nunca SVG inyectado),
confirmar con un código, recibir 8 códigos de recuperación una sola vez; desactivar
pidiendo la clave.

**Aviso de datos personales.** Texto en `configuracion.aviso_datos_personales`,
editable en Textos institucionales; aceptación registrada en `usuarios.acepto_datos_en`
y en bitácora (`aceptar_aviso_datos`). Si la entidad cambia el texto no se vuelve a pedir
(decisión de esta fase; F18 puede añadir versión del aviso si hace falta).

## 7. Administración de usuarios y estructura

- **Usuarios** (`/admin/usuarios`): lista con filtros por texto, rol y estado, columnas
  usuario, nombre, rol, cargo y área, estado (activo, bloqueado hasta, inactivo), TOTP,
  último ingreso. Advertencia permanente mientras haya menos de dos Admin SGC activos
  (spec DC9). Crear: usuario (`^[a-z0-9._-]{3,40}$`), nombre, correo institucional
  opcional, rol, cargo, jefe inmediato opcional, procesos (obligatorios para
  `lider_proceso`, al menos uno; opcionales para los demás como filtro por defecto),
  marca `ver_historial`. Al crear se muestra la clave temporal una sola vez. Detalle:
  editar (cambios de rol, cargo y procesos quedan en bitácora con antes y después),
  desactivar o reactivar, restablecer clave (nueva temporal mostrada una vez),
  desbloquear, quitar segundo factor (cuando el usuario perdió el teléfono), ver
  supervisor resuelto y sesiones activas del usuario. Reglas de autoprotección en el
  servidor: nadie puede desactivarse a sí mismo ni quitarse el rol `admin_sgc`.
- **Alta por lote** (`/admin/usuarios/lote`): plantilla CSV descargable (UTF-8 con BOM,
  separador `;`, columnas `usuario;nombre;correo;rol;cargo;procesos`), donde `rol`
  acepta código o etiqueta, `cargo` es el nombre exacto del cargo y `procesos` son
  siglas separadas por `|`. El sistema acepta también `,` como separador si la cabecera
  lo usa. Valida fila por fila (zod), rechaza duplicados dentro del archivo y contra la
  BD, crea las válidas (una transacción por fila) y muestra una tabla de resultados con
  la clave temporal de cada cuenta creada y el motivo de cada rechazo, descargable como
  CSV desde el navegador. Límite: 500 filas por archivo.
- **Áreas y cargos** (`/admin/estructura`): áreas con orden y activo (reutiliza los
  botones de orden y activo del editor del mapa si el motor genérico admite la tabla
  sin cambios; si no, funciones propias); cargos con área y cargo superior; el servidor
  rechaza ciclos en la cadena de superiores. Desactivar, no borrar, lo que tenga
  usuarios. `supervisoresDe(usuarioId)`: el jefe inmediato si está definido; si no, los
  usuarios activos cuyo cargo es el superior del cargo del usuario.
- **Accesos** (`/admin/accesos`): tabla paginada (50) con filtros por usuario,
  resultado y fechas; misma forma que la bitácora.
- **Sesiones activas** (`/admin/sesiones`): usuario, rol, IP, navegador, inicio, último
  uso, vencimiento; botón "Cerrar" (queda en `accesos` como `cierre_forzado` y en
  bitácora).

## 8. Guard, rutas y archivos

- `src/proxy.ts`: pasa a proteger todo salvo `/ingreso` y `/api/salud` (el healthcheck
  del compose lo usa) y los activos estáticos (`_next/static`, `_next/image`,
  `favicon.ico`, archivos con extensión de imagen o fuente). `/admin/ingreso` redirige a
  `/ingreso`. Sin cookie: rutas bajo `/api/` o `/admin/api/` responden 401 JSON; el resto
  redirige a `/ingreso?volver=<ruta>`. El archivo sigue importando solo
  `sesion-constantes` (su bundle no debe arrastrar postgres).
- Grupos de rutas: `src/app/(portal)/` (inicio, procesos, documentos, buscar,
  sin-acceso) con layout que exige sesión completa; `src/app/(cuenta)/` (cuenta,
  clave-inicial, segundo-factor, aviso-datos) con layout que exige sesión pero admite
  pendientes; `src/app/ingreso/` público; `src/app/admin/(panel)/` exige sesión completa
  y `panel.entrar`. Las URL no cambian. Todas estas páginas llevan `dynamic =
  "force-dynamic"` (regla F9-D7: página autenticada que consulta BD nunca se
  prerenderiza; el build de CI no tiene `DATABASE_URL`).
- `src/lib/sesion-actual.ts`: `sesionActual()` (lee la cookie con `cookies()`, cacheada
  por petición con `React.cache`), `requerirSesion()` para acciones y layouts, y
  `sesionDePeticion(peticion)` para route handlers, que lee la cookie del `NextRequest`:
  así los handlers se prueban pasando la cookie en la petición, como ya hace
  `tests/descarga-estampada.test.ts`.
- `mutacion(formData, permiso, fn)` en `src/app/admin/comun.ts`: sesión completa →
  permiso → límite de 60 mutaciones por minuto por usuario → `fn`. Las acciones que no
  pasan por `mutacion` llaman `requerirPermiso` explícitamente. Un test estructural
  recorre los archivos `acciones*.ts` y exige una de las dos cosas en cada acción
  exportada.
- Handlers que escriben verifican `Origin` con `origenValido()` compartido (hoy solo lo
  hace la subida; el `DELETE` de archivos no).
- Límites: búsqueda y archivos del portal pasan a limitarse **por usuario** (30 y 60
  por minuto); el ingreso por IP (30 por minuto, solo IP conocida); mutaciones 60 por
  minuto por usuario; subida 30 por minuto por usuario.
- `eventos_consulta` registra `usuario_id` además de IP y user-agent (D8 ampliada).

## 9. Semillas

- `npm run db:seed` (demo): mapa real de Suaza y documentos ficticios (sin cambios en
  conteos: 28 documentos, 26 vigentes, 1 obsoleto, 1 borrador, 1 anulado), más cinco
  áreas, nueve cargos con jerarquía y cinco usuarios de ejemplo con clave
  `Demo-SGC-2026-clave`, sin cambio obligatorio y con el aviso aceptado: `gerente`
  (gerencia, Gerente), `control.interno` (control_interno, Jefe de Control Interno),
  `lider.gth` (lider_proceso, Coordinadora de Talento Humano, proceso GTH), `lider.cex`
  (lider_proceso, Médico Coordinador, proceso CEX) y `consulta` (consulta, Auxiliar de
  Enfermería). El `admin` sigue saliendo de `npm run admin:asegurar`.
- `npm run db:seed:minima`: configuración "Entidad sin configurar", aviso de datos
  personales de ejemplo, los nueve tipos de documento genéricos, patrón de código por
  defecto; sin mapa, sin áreas, sin documentos. Es la semilla de una instalación nueva.
- Ambas corren con la conexión del migrador y vacían las tablas antes de sembrar.

## 10. Valores fijados

| Qué | Valor |
|---|---|
| Intentos antes del bloqueo | 5 |
| Bloqueo inicial / factor / máximo | 15 min / ×2 / 24 h |
| Fallos de segundo factor antes de cerrar la sesión pendiente | 5 |
| Ventana TOTP | ±1 periodo (30 s), 6 dígitos |
| Códigos de recuperación | 8, formato `XXXXX-XXXXX`, un solo uso, guardados como SHA-256 |
| Longitud de clave | 12 a 128 |
| Inactividad de sesión | 60 min (env) |
| Límite de ingreso por IP conocida | 30 por minuto |
| Límite de mutaciones por usuario | 60 por minuto |
| Límite de subida por usuario | 30 por minuto |
| Filas máximas por lote | 500 |
| Páginas de accesos y bitácora | 50 filas |
| Usuario | `^[a-z0-9._-]{3,40}$` |
