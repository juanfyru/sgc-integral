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
8. **Zona horaria por instalación:** variable `ZONA_HORARIA` (nombre IANA), por defecto
   `America/Bogota`; la BD guarda `timestamptz`. La conexión de la app abre con
   `TimeZone = zonaHoraria()` (`src/db/cliente.ts`), así `to_char`, `date_trunc` y los
   casts `::date` de toda consulta calculan en esa zona; el código TypeScript que formatea
   fechas con `Intl` usa el helper `zonaHoraria()` (`src/lib/zona-horaria.ts`). Nunca se
   fija una zona en el código. Una zona inválida impide el arranque (`scripts/arrancar.ts`).
9. **Una sola instancia de app.** Los límites de ritmo viven en memoria. La IP del
   cliente se toma de `X-Forwarded-For` (último elemento) o `X-Real-IP` **solo con
   `CONFIAR_PROXY=1`** (el único camino de entrada es el proxy); sin la variable la IP es
   desconocida y esas cabeceras se ignoran.
10. **Dos conexiones de BD:** `DATABASE_URL_MIGRADOR` (dueño del esquema: migraciones,
    semillas y creación del rol de la app) y `DATABASE_URL` (rol `sgc_app`, solo DML,
    sin `UPDATE` ni `DELETE` en `auditoria`, `accesos`, `firmas`, `tramite_eventos`,
    `copia_eventos`, `acuse_eventos`, `ratificaciones`, `externo_verificaciones` y
    `norma_cambios`).
    `asegurarRolApp` (`src/db/roles-bd.ts`) crea el rol y aplica sus privilegios en cada
    arranque, después de las migraciones. Los secretos (`APP_SECRETO`, `BD_APP_CLAVE`) se
    generan al instalar; sin un `APP_SECRETO` válido el arranque de producción falla.
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
3. **Visibilidad por rol, nivel de acceso y participación** (spec §5.3; spec 13A §6.5 y
   §12): la vigente para todo usuario con sesión, salvo los documentos restringidos, que solo
   ven Admin SGC, Gerencia, Control Interno y los asignados a sus procesos. Cada estado no
   vigente tiene su criterio y ninguna versión se sirve sin él: obsoleta y anulada exigen
   `documentos.ver_historial` (Admin SGC, Control Interno y la marca individual
   `ver_historial`, que no abre lo restringido); en trámite, ser participante de ese trámite,
   Admin SGC o líder; descartada, `documentos.administrar`. Quien no puede ver algo recibe
   «no encontrado», nunca «sin permiso». El acta se sirve a quien ve su versión o ve el
   trámite cerrado.
4. **Toda ruta exige sesión; toda escritura exige el permiso de la matriz
   `src/lib/permisos.ts`** y pasa por `mutacion()` o `requerirPermiso()`; los handlers
   que escriben verifican `Origin`. Toda acción del trámite lleva su permiso de matriz
   (`PERMISO_DE_ACCION`), además de la condición de persona de la tabla de transiciones.
5. **Trazabilidad completa:** toda acción de cualquier usuario queda en bitácora,
   inmutable en BD, con quién, qué y cuándo. `auditoria`, `accesos`, `firmas`,
   `tramite_eventos`, `copia_eventos`, `acuse_eventos`, `ratificaciones`,
   `externo_verificaciones` y `norma_cambios` son de solo inserción (trigger que
   rechaza `UPDATE` y `DELETE` incluso al dueño del esquema, más los privilegios de `sgc_app`);
   los usuarios con historia se desactivan, nunca se borran, y una verificación cerrada no se
   modifica. Una revisión anual cerrada tampoco, ni sus procesos ni sus decisiones: el trigger
   `sgc_impedir_si_revision_cerrada` rechaza `UPDATE` y `DELETE` sobre ellas y la inserción de
   filas hijas. Toda acción que `src/` escribe en la bitácora tiene su frase legible y su
   nombre de filtro en `src/lib/bitacora-detalle.ts` (`describirEvento`, `nombreDeAccion`),
   armada solo con el `detalle` de la fila: lo exige `tests/bitacora-detalle.test.ts`, que recorre
   las llamadas a `registrarAuditoria` (las acciones armadas con una variable se listan a mano).
   **Única excepción documentada (F12-D35):** las preferencias de interfaz de cada
   persona (el tema) y las marcas de notificación leída no se auditan: no son evidencia de 7.5
   y llenarían la bitácora de ruido. El acuse de lectura, que F12-D35 dejó pendiente, sí se
   audita (`acuse_lectura`) y tiene su historial inmutable en `acuse_eventos`. Cualquier otra
   acción sin auditar se propone antes.
6. **El MIME se detecta de los magic bytes en la carga** (no de la extensión del nombre)
   y se guarda en BD. El ícono de formato se deriva del MIME guardado.
7. **Archivos fuera del webroot**, servidos por la app con `Content-Type` y
   `Content-Disposition` correctos. Nombres saneados (path traversal). Nunca ejecutables.
8. **El mapa de procesos NO se hardcodea.** Vive en BD y se edita desde el admin. El
   render es 100% data-driven. Layout por bandas fijas (ver `PLAN.md` §Layout).
9. **Toda transición de un trámite entra por `transicionar`**
   (`src/db/consultas/tramites-flujo.ts`); ningún otro código cambia `tramites.etapa`.
10. **El camino directo del panel solo da de alta documentos ya aprobados:** nunca publica
    sobre una versión vigente y se cierra con `publicacion_directa`. Eliminar un documento
    es siempre un trámite. **La adopción de una edición de un documento externo**
    (`adoptarEdicion`, `src/db/consultas/vigencia/externos/adopcion.ts`) es el único camino sin
    trámite que publica sobre una versión vigente: siempre con la firma «Adoptó» y por
    `aplicarPublicacion(tx, versionId, "externo", …)`. La carga directa sigue sin poder hacerlo.
11. **El acta se congela al cierre** en `detalle.acta` del evento y solo se regenera si
    coincide con la huella guardada (F13A-R17). El formato elegido se congela también en
    `detalle.acta` (archivo y huella); `generarActa` no cambia un solo byte sin formato.

## Stack (decidido — no cambiar sin proponerlo antes)

| Capa | Elección | Notas |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript estricto, `output: 'standalone'` | Node 24 LTS en la imagen, CI y desarrollo (mismo major en los tres: npm 10 y 11 generan lockfiles incompatibles) |
| UI | Tailwind CSS + componentes propios en `src/componentes/ui` (shadcn/ui solo como hoja base) | Íconos: `lucide-react` (local). Tema claro y oscuro con tokens CSS (`light-dark()`) |
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
- **Estructura:** App Router con el portal y el panel en `app/(app)` (el panel en
  `app/(app)/admin/(panel)`), las acciones y handlers del panel en
  `app/admin/{acciones*.ts,comun.ts,api}`, los pasos de la cuenta en `app/(cuenta)` y el
  ingreso en `app/ingreso`. Lógica de datos en `src/db` (schema Drizzle + queries),
  lógica de negocio en `src/lib`. El trámite documental vive en `app/(app)/tramites`,
  `app/acciones-tramites.ts`, `src/db/consultas/flujo/` y `src/lib/tramites/` (reglas puras).
  La vigencia vive en `app/(app)/vigencia`, `app/acciones-vigencia.ts`,
  `src/db/consultas/vigencia/` y `src/lib/vigencia/`; el normograma, en `app/(app)/normograma`,
  `app/acciones-normograma.ts`, `src/db/consultas/normograma/` y `src/lib/normograma/`. Los
  indicadores documentales viven en `src/lib/indicadores-documentales/` (funciones puras y tipos)
  y `src/db/consultas/vigencia/indicadores.ts` (solo trae filas), y se calculan solo en
  `/vigencia/indicadores` y su Excel, nunca en el cascarón.
  Server Components por defecto; `'use client'` solo donde hay interactividad.
- **Cascarón y componentes base:** toda página autenticada vive dentro del cascarón del
  layout de `(app)` (`src/componentes/cascaron`: barra lateral, barra superior, búsqueda,
  campana y menú); los pasos de la cuenta y el ingreso usan `PantallaCentrada`. La
  navegación sale de `src/componentes/cascaron/navegacion.ts`, cada entrada con su
  permiso; un módulo aparece en ella solo cuando existe. Las pantallas nuevas usan los
  componentes de `src/componentes/ui`: `EncabezadoPagina` para todo `h1` dentro del
  cascarón, salvo las pantallas centradas (`PantallaCentrada`) de la cuenta y el ingreso,
  que conservan su `h1` propio; y `TablaDatos`, `Insignia`, `TarjetaCifra`, `EstadoVacio`,
  `Boton`, `Campo`, `Dialogo` y `GraficoBarras`.
- **Tema y color:** el tema lo resuelve el servidor en `<html data-tema>` (`claro`,
  `oscuro` o `sistema`, desde el perfil o la cookie `sgc_tema`), sin script inline; los
  tokens de `src/app/globals.css` llevan su valor claro y oscuro con `light-dark()` y la
  variante `dark:` de Tailwind apunta al atributo. El código nuevo usa los nombres de
  token (`bg-marca-relleno`, `hover:bg-marca-oscurecida`, `text-marca`, `border-marca`,
  `bg-estado-<x>-fondo`, `text-estado-<x>-texto`, `banda-*`; F12-D34), nunca los alias
  heredados `azul`/`verde` ni colores fijos de Tailwind (`bg-white`, `text-gray-*`…: lo
  exige `tests/colores-fijos.test.ts`). Texto blanco sobre el color de una banda del mapa
  va sobre `banda-solido` (F12-D36).
- **La entidad es configuración, no código:** nombre, sigla, lema, logo y colores salen
  de `obtenerMarca()`/`obtenerMarcaSegura()` (`src/db/consultas/entidad.ts`). Ningún
  nombre de entidad ni "SGC Documental" se escribe en `src/` fuera de la semilla demo (lo
  exige `tests/textos-fijos.test.ts`). Un color del administrador llega al `style` de
  `<html>` solo tras validar el hex estricto y el contraste P1/P2 (`src/lib/marca.ts`).
- **Migraciones versionadas con Drizzle Kit**, ejecutadas en el arranque del contenedor.
  Nunca `db push` contra producción. `src/db/esquema.ts` nunca importa con `@/`
  (drizzle-kit lo carga sin el alias): solo rutas relativas. Al cierre de la 13C son once
  (`drizzle/0000` a `drizzle/0010`; el spec 13C §19 dice nueve).
- **Toda página autenticada lleva o hereda de su layout `force-dynamic`** (`export const
  dynamic = "force-dynamic"`; lo declaran `src/app/layout.tsx` y los layouts de
  `(app)`, `(cuenta)` y `(app)/admin/(panel)`): nunca se prerenderiza, y el build de CI no
  tiene `DATABASE_URL`.
- **Toda consulta de los módulos nuevos pasa por `alcanceProcesos()`**
  (`src/lib/alcance.ts`): el líder de proceso solo alcanza sus procesos activos; el
  filtro por rol no se reimplementa en cada módulo. La visibilidad de documentos y de
  trámites se decide en ese mismo archivo; la participación designada en un trámite es la
  única excepción a `alcanceProcesos()`.
- **Accesibilidad no negociable:** navegable por teclado, foco visible, contraste AA,
  SVG del mapa con roles/etiquetas ARIA. El ícono de formato de archivo nunca es la
  única señal (siempre etiqueta textual + tamaño, `aria-label`), ni el color de un
  estado (la `Insignia` lleva texto siempre). Nada de `opacity` para atenuar texto o
  controles (inactivos, obsoletos): baja el contraste por debajo de AA (F12-D41, F12-D42).
- **Seguridad en cada PR que toque rutas:** verificar que ninguna ruta quede fuera del
  guard de sesión ni ninguna escritura fuera de su permiso. Cabeceras CSP,
  `X-Content-Type-Options`, `X-Frame-Options` en `next.config`/proxy. Reglas fijas:
  - **Cada página que lee la sesión llama ella misma** `exigirSesion()`,
    `exigirPermiso(permiso)` o `exigirSesionConPendientes()` (`src/lib/paginas.ts`). El
    layout no basta: en Next 16 no se vuelve a ejecutar en la navegación de cliente ni
    impide que la página entre en el payload RSC. El layout del panel usa además
    `exigirEntradaPanel()` (`panel.entrar` o la marca `ver_historial`). Lo exige
    `tests/paginas-sesion.test.ts`.
  - **Las páginas de Vigencia y del normograma** llaman `exigirSesion()` y después su regla de
    alcance con `notFound()` (el patrón de `exigirDistribucion`, F13C-DC39: `exigirVigencia` en
    `app/(app)/vigencia/_comun.ts`, la pestaña visible, la revisión, el externo, la norma o el
    impacto que la persona ve), nunca `exigirPermiso`: quien no la ve recibe «no encontrado». Los
    catálogos de puntos de uso y listas de distribución viven en `app/(app)/admin/(catalogos)`,
    fuera del guard del panel: cada página llama `exigirSesion()` y `exigirCatalogo()` (en solo
    lectura sin `distribucion.gestionar`), y las de alta, además, `exigirGestion()`
    (`app/(app)/admin/(catalogos)/_comun.ts`).
  - **`/tramites/nueva` llega prellenada** desde la revisión anual (`?revision=`) y desde un
    impacto normativo (`?impacto=`): los campos ocultos `revisionAnualId` e `impactoId` los
    vuelve a validar `crearSolicitud` dentro de su transacción, y la página nunca dice por qué
    ignoró un valor que no admite.
  - **Cada Server Action exportada** de `src/app/admin/acciones*.ts`,
    `src/app/acciones-tramites.ts`, `src/app/acciones-distribucion.ts`,
    `src/app/acciones-vigencia.ts` y `src/app/acciones-normograma.ts` pasa por
    `mutacion(formData, "<permiso>", fn)` o llama
    `requerirPermiso(sesion, permiso)` después de `requerirSesion()`. Las de `src/app/acciones-cuenta.ts` llaman
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
    escriben verifican `Origin` con `origenValido()`. Excepción: el GET de un archivo
    responde 404 a quien no puede verlo (F13A-R3, spec 13A §12).
  - **Las rutas que reciben una subida van fuera del `matcher` de `src/proxy.ts`**
    (`admin/api/archivos`, `api/tramites/[id]/archivos`, `api/socializaciones/[id]/archivos`,
    `api/verificaciones/[id]/items/[itemId]/archivos`, `api/externos/[versionId]/archivos`,
    `api/normas/[id]/archivos` y `api/hallazgos/[id]/archivos`, cada una con su caso en
    `tests/proxy-matcher.test.ts`), usan `recibirArchivo` y comparan
    `content-length`: el búfer del proxy truncaba las subidas de más de 10 MB y respondía
    201 (F13A-R10).
  - **Los formularios que envían un `id` de ruta** se leen con
    `parsearFormulario(formData, Esquema, { omitir: ["id"] })` y el id con
    `idNumerico()`, porque los esquemas son estrictos.
  - **Todo CSV o Excel que genera la app neutraliza fórmulas** con
    `neutralizarFormula()` (`src/lib/celdas.ts`, regla D54).
  - Toda redirección con `volver` pasa por `rutaInterna()`. El matcher de
    `src/proxy.ts` escribe los puntos literales como `[.]` (Next no escapa el `.`, y
    `\.` coincide con cualquier carácter).
  - **Rutas públicas:** solo `/ingreso`, `/api/salud` y `/marca/logo` (`RUTAS_PUBLICAS`
    de `src/proxy.ts`). Una nueva se propone antes y entra con su caso en
    `tests/proxy-matcher.test.ts`.
- **Toda escritura de la distribución** (`src/app/acciones-distribucion.ts`, los handlers de
  `distribucion/copias`, `api/socializaciones`, `api/verificaciones` y `api/hallazgos`) exige su
  permiso de matriz **más** la condición de persona: ser el responsable del punto (recibir,
  recoger, corregir un hallazgo) o el destinatario del acuse (confirmarlo). El permiso solo no
  basta: lo tienen los cinco roles (`distribucion.responder`, `acuses.confirmar`). Una lista de
  distribución admite el miembro `todos` (sin `referencia_id`): toda la planta activa en el
  momento del evento.
- **El cierre de un hallazgo es en dos pasos** (`src/db/consultas/distribucion/hallazgos.ts`): el
  responsable lo marca corregido (`corregirHallazgo`, que avisa a los demás Admin SGC con
  `hallazgo.por_validar`) y lo cierra la validación del Admin SGC (`validarHallazgo`, o
  `reabrirHallazgo` con nota y fecha nueva) o la siguiente verificación del punto
  (`validarPorVerificacion`, dentro de `cerrarVerificacion`). Quien corrige no valida su
  corrección, ni la cierra directamente (`cerrarHallazgo`) mientras haya otro Administrador del
  SGC activo (`exigirSinOtroAdmin`, `src/db/consultas/distribucion/otro-admin.ts`, la misma regla
  de «propio punto»); si es el único, la cierra y la bitácora lo marca (`propioCorrector`).
- **`archivos` admite dueños distintos de una versión** (`contexto`: `version`, `jornada`,
  `verificacion_item`, `norma`, `revision_anual` y `hallazgo`, con `contexto_id`;
  `CONTEXTOS_EVIDENCIA` de `src/lib/subida.ts`): el control de acceso de un archivo es el de su
  dueño, y las consultas heredadas siguen filtrando por `version_id`. El PDF de una norma se
  lee como la norma; la foto de la corrección de un hallazgo, como el hallazgo (`filtroPuntos`);
  el informe de una revisión anual (rol `evidencia`, `version_id` nula, uno por año en
  `informes/revision-<año>.pdf`) solo lo descargan Admin SGC, Gerencia y Control Interno
  (`puedeVerInformeAnual`), y los demás reciben 404.
- **Una versión deja de ser vigente solo por `aplicarPublicacion`, `anularVigenteEn` o
  `deshacerCarga`**, y los tres llaman `alDejarDeSerVigente`: marca sus copias controladas
  como «por recoger», supera sus acuses pendientes y su socialización requerida. Ninguna otra
  ruta cambia ese estado. La adopción de una edición de un externo publica por
  `aplicarPublicacion` y su retiro anula por `anularVigenteEn` (motivo `retirado`): no hay un
  cuarto llamador.
- **La fecha base de la próxima revisión depende del origen** (`fechaBase`,
  `src/lib/vigencia/plazo.ts`; F13C-DC31): un interno publicado en la plataforma cuenta desde su
  publicación; uno aprobado fuera, desde su `fecha_aprobacion`, nunca desde `publicado_en` (la
  carga directa lo escribe con la fecha de carga); en los dos, una ratificación posterior manda.
  Un externo cuenta desde su última verificación o, sin ella, desde su adopción. La fecha
  fijada a mano reemplaza a la calculada, y publicar una versión nueva la borra junto con las
  marcas del aviso (`aplicarPublicacion`). El plazo y la periodicidad se suman en meses
  calendario (`sumarMeses`) y el estado se calcula, nunca se guarda (`columnasDeVigencia`).
- **La revisión anual** (`src/db/consultas/vigencia/revision-anual/`): los actos que deciden
  fuera de su página (ratificar, verificar, adoptar o retirar un externo, pedir una solicitud,
  publicar, deshacer una carga) registran la decisión dentro de su propia transacción, a nombre
  de quien actuó (`registrarDecision` y `sacarDeLaFoto`, `registro.ts`). El orden de candados es
  la revisión primero (el acto la lee `FOR SHARE`; el cierre y la prórroga la toman
  `FOR UPDATE`) y las filas hijas después. El informe se congela al cierre
  (`revisiones_anuales.informe`) y su PDF se genera al primer pedido, como el acta:
  `asegurarInforme` (`src/db/consultas/vigencia/informe.ts`) repite a propósito el algoritmo
  de `asegurarActa` (F13A-R17), y un cambio de su invariante va en los dos.
- **Tests contra la BD de desarrollo:** todo usuario de prueba que genere filas en
  `auditoria`, `accesos`, `firmas`, `tramite_eventos`, `copia_eventos`, `acuse_eventos`,
  `ratificaciones`, `externo_verificaciones` o `norma_cambios` usa un nombre único por corrida
  (`zz_<algo>_${Date.now()}`) y no se borra (FK `RESTRICT` y trigger de solo inserción).
  Nunca `DELETE` ni `UPDATE` sobre esas tablas en una limpieza. Un test que escribe datos
  capaces de bloquear la migración o el arranque, o de romper otros tests (un usuario duplicado, la
  configuración de la entidad), los escribe dentro de una transacción que se revierte o
  los restaura en `finally`: un test que falla no debe dejar la base inservible. Ningún test
  deja confirmada una revisión anual (cerrada ya no se modifica y su año es único): la abre y la
  cierra dentro de la transacción revertida, en un año lejano, y antes cierra la que esté
  abierta (`sinRevisionAbierta`, `tests/utiles/vigencia.ts`).
- **Transiciones del trámite:** la firma se verifica fuera de la transacción y lo que puede
  fallar va antes, en un validador de solo lectura (F13A-R4); `opciones.ahora` es la hora de
  todo lo escrito (F13A-P1). `transicionar` guarda en el `detalle` de cada evento que cambia de
  etapa la fecha límite de la etapa que cierra (`venceEn`), y `reasignar` usa esa misma clave
  para la fecha nueva: una acción nueva que no cambie de etapa entra en
  `EVENTOS_SIN_CAMBIO_DE_ETAPA` (`src/lib/tramites/dia-de-etapa.ts`), o el indicador de etapas en
  plazo la contaría.
- **Firmas sin trámite:** «Ratificó» y «Adoptó» se guardan con `registrarFirma` con
  `tramiteId: null` y `ronda = 0`; el cierre de la revisión anual pide la clave igual y guarda
  su método en la revisión (`metodo_cierre`), sin fila en `firmas`. Los tres siguen F13A-R4: un
  validador de solo lectura antes (`validarRatificacion`, `validarAdopcion`, `validarCierre`),
  la clave con `verificarParaFirmar` fuera de la transacción y las comprobaciones repetidas
  dentro con `FOR UPDATE`. Ratificar, y adoptar una edición con archivo, recalculan la huella
  del archivo en disco (`exigirHuellaRegistrada`); si no es la registrada, nada se escribe y el
  rechazo queda en la bitácora, fuera de la transacción (`conRechazoPorHuella`,
  `src/db/consultas/vigencia/comun.ts`).
- **El cumplimiento de un porcentaje con meta se decide con la razón exacta, en enteros**
  (`cumplePorcentaje`, `src/lib/indicadores-documentales/metas.ts`; `conformidad`,
  `src/lib/distribucion/verificacion.ts`), nunca con el entero que se muestra. `conformidad()`
  muestra el porcentaje truncado, así la cifra entera nunca contradice el veredicto; los demás
  indicadores redondean y, cuando el entero contradiría el veredicto, `textoPorcentaje`
  (`textos.ts`) muestra un decimal truncado.
- **Tests y demo:** `tramiteEn` crea su documento: ningún test abre un trámite sobre uno de
  la demo. `tests/semilla-tramites.test.ts` lee el estado de la demo y salta con mensaje si
  ya avanzó; `SEMILLA_RECIEN=1 npm test` exige la demo recién sembrada.

## Comandos

```bash
npm run dev             # desarrollo local en :3002 (requiere Postgres: docker compose -f docker-compose.dev.yml up -d bd)
npm run build           # build de producción (standalone)
npm run lint            # ESLint + tsc --noEmit
npm test                # tests (Vitest)
SEMILLA_RECIEN=1 npm test  # lo mismo, exigiendo la demo recién sembrada: un caso saltado falla
$env:SEMILLA_RECIEN=1; npm test  # lo mismo en PowerShell
npm run db:generate     # generar migración desde el schema Drizzle
npm run db:migrate      # aplicar migraciones (con DATABASE_URL_MIGRADOR); antes detiene si hay usuarios duplicados sin distinguir mayúsculas
npm run db:roles        # crear o sincronizar el rol sgc_app y sus privilegios
npm run db:preparar     # migraciones y luego rol de la app (db:migrate + db:roles)
npm run db:seed         # semilla demo: mapa real, documentos ficticios, estructura, usuarios por rol y trámites
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
