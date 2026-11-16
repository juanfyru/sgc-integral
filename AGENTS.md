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
    `copia_eventos`, `acuse_eventos`, `ratificaciones`, `externo_verificaciones`,
    `norma_cambios`, `medicion_eventos`, `medicion_observaciones`, `cierres_indicadores`,
    `importaciones_indicadores`, `importacion_eventos`, `reporte_externo_eventos` y
    `variable_eventos`).
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
5. **Trazabilidad completa:** toda acción de cualquier usuario queda en bitácora, inmutable en BD,
   con quién, qué y cuándo. `auditoria`, `accesos`, `firmas`, `tramite_eventos`, `copia_eventos`,
   `acuse_eventos`, `ratificaciones`, `externo_verificaciones`, `norma_cambios`,
   `medicion_eventos`, `medicion_observaciones`, `importaciones_indicadores`, `importacion_eventos`,
   `reporte_externo_eventos` y `variable_eventos` son de solo inserción (trigger que rechaza `UPDATE` y `DELETE` incluso al
   dueño del esquema, más los privilegios de `sgc_app`); los usuarios con historia se desactivan,
   nunca se borran, y una verificación cerrada no se modifica. Una revisión anual cerrada tampoco,
   ni sus procesos ni sus decisiones: el trigger `sgc_impedir_si_revision_cerrada` rechaza `UPDATE`
   y `DELETE` sobre ellas y la inserción de filas hijas. Lo mismo en los indicadores: una medición
   cerrada no cambia salvo su reapertura, que deja quién, cuándo y por qué
   (`sgc_impedir_si_medicion_cerrada`, sobre `mediciones` y `medicion_valores`, también al insertar
   valores); una versión aprobada de una ficha no cambia, ni sus variables, responsables y normas
   (`sgc_impedir_si_version_aprobada`, también al insertar hijas); y un cierre del mes
   (`cierres_indicadores`) no se modifica ni se borra (trigger `sgc_impedir_modificacion` y el
   `REVOKE` de `sgc_app`, con su caso en `tests/privilegios-bd.test.ts`; la reapertura no lo toca).
   Cada acción de la bitácora tiene su frase legible y su nombre de filtro en
   `src/lib/bitacora-detalle.ts` (`describirEvento`, `nombreDeAccion`), armada solo con el
   `detalle` de la fila. `tests/bitacora-detalle.test.ts` lo exige para las acciones con nombre
   literal en las llamadas a `registrarAuditoria` de `src/` (lee el texto: también los dos lados de
   un ternario) y para las armadas con una variable o una plantilla que lista a mano
   (`ACCIONES_ARMADAS`). Las plantillas `tramite_*` y las de los catálogos del mapa (`reordenar_`,
   `activar_`, `desactivar_` y `borrar_` más el catálogo, `mapa-admin.ts`) tienen frase por su
   camino genérico y el test no las vigila. Una acción nueva que se arme con una variable entra a
   `ACCIONES_ARMADAS`. Hay dos excepciones nombradas, una a la inmutabilidad y otra a la bitácora:
   - **Las fichas aprobadas de un lote de importación (spec 14A §5.9):** una versión aprobada que
     entró con un lote solo se borra, con sus variables, responsables y normas, al «Deshacer la
     importación» (`deshacerImportacion`, `src/db/consultas/indicadores/importacion.ts`), y solo
     mientras ninguna ficha del lote tenga periodos cerrados o con datos, personas designadas, otra
     versión, revisiones por cambio de norma (`impactos_indicadores`) ni constancias de envío al ente
     (`reportes_externos`), ni una propuesta editada o enviada a aprobación después de importarse
     (`condicionDeDeshacer`, revisada otra vez con las filas bloqueadas), y toda versión que lleve el
     id del lote esté en el registro de su evento `importado`. El trigger la deja borrar
     si la transacción lleva la marca `sgc.deshacer_importacion` con el id de su lote, que se pone
     en ese único lugar y local a la transacción (`set_config(…, true)`: una marca de sesión
     quedaría en la conexión del pool; lo exige `tests/indicadores-importacion.test.ts`). El lote y
     sus eventos no se tocan: deshacer les añade el suyo.
   - **Lo que no se audita (F12-D35):** las preferencias de interfaz de cada persona (el tema) y
     las marcas de notificación leída: no son evidencia de 7.5 y llenarían la bitácora de ruido. El
     acuse de lectura, que F12-D35 dejó pendiente, sí se audita (`acuse_lectura`) y tiene su
     historial inmutable en `acuse_eventos`. Cualquier otra acción sin auditar se propone antes.
6. **El MIME se detecta de los magic bytes en la carga** (no de la extensión del nombre)
   y se guarda en BD. El ícono de formato se deriva del MIME guardado. De `file-type`, en `src/`
   solo se importa `fileTypeFromBuffer` (F14A-R41): `fileTypeFromFile` carga sus módulos con un
   `import()` no literal que el empaquetador de Next reemplaza por uno que siempre lanza (todo
   `.xlsx` respondía 500 en `next dev` y en la imagen, y Vitest, que no empaqueta, no lo veía). El
   `.xlsx` de un soporte se lee entero (hasta 25 MB) y se analiza como búfer. Lo exige
   `tests/file-type-empaquetado.test.ts`.
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
| Animación | CSS (transiciones y `@keyframes` en `src/app/globals.css`) | `motion` (Framer Motion) no está instalada y no se añade sin proponerlo (F14-DC23). Respetar `prefers-reduced-motion` siempre |
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
  `app/admin/{acciones*.ts,comun.ts,api}`, los pasos de la cuenta en `app/(cuenta)` y el ingreso
  en `app/ingreso`. Lógica de datos en `src/db` (schema Drizzle + queries), lógica de negocio en
  `src/lib`. El trámite documental vive en `app/(app)/tramites`, `app/acciones-tramites.ts`,
  `src/db/consultas/flujo/` y `src/lib/tramites/` (reglas puras). La vigencia vive en
  `app/(app)/vigencia`, `app/acciones-vigencia.ts`, `src/db/consultas/vigencia/` y
  `src/lib/vigencia/`; el normograma, en `app/(app)/normograma`, `app/acciones-normograma.ts`,
  `src/db/consultas/normograma/` y `src/lib/normograma/`. Los indicadores documentales viven en
  `src/lib/indicadores-documentales/` (funciones puras y tipos) y
  `src/db/consultas/vigencia/indicadores.ts` (solo trae filas), y se calculan solo en
  `/vigencia/indicadores`, su Excel y la foto de un indicador automático (`tomarCalculo`), nunca en
  el cascarón. El módulo de **Indicadores** (Fase 14)
  vive en `app/(app)/indicadores`, `app/acciones-indicadores.ts` (las de sus maestros y
  parámetros, en `app/admin/acciones-indicadores.ts`), `src/db/consultas/indicadores/`,
  `src/lib/indicadores/` (reglas puras: fórmula, periodos, semáforo, textos, acumulado, estados,
  la foto y los objetivos; el registro de los diez cálculos automáticos, en
  `src/lib/indicadores/calculos/`) y `src/componentes/indicadores/`; su configuración, en
  `app/(app)/admin/(panel)/indicadores`. Lo de la 14B, en `src/db/consultas/indicadores/`:
  `calculos.ts` (el camino de sistema, `tomarCalculo`), `fotos.ts` (`tomarFotos` y `volverACalcular`),
  `publicacion.ts` (`alPublicarVersion`: lo que pasa cuando una versión queda aprobada; lo llaman
  `aprobarFichas` y el cambio menor de `enviarAAprobacion`, y la importación de lotes **no**),
  `fichas-de-calculo.ts` (la ficha activa de un cálculo y la meta que rige hoy; lo importan Vigencia,
  Distribución y Configuración documental, y a Vigencia la importa `calculos.ts`, así que lee por SQL
  directo y no importa los cálculos, las mediciones, Vigencia, Distribución ni Configuración
  documental), `objetivos.ts`
  (la regla única de qué medición cuenta para un objetivo), `constancias.ts`, `constancias-soporte.ts`
  (módulo liviano: lo importa `admin.ts`, así que no importa `lectura`, `aprobacion` ni `fichas`),
  `constancias-vencidas.ts`, `pasada.ts` (el paso genérico de las pasadas de avisos, `correrPaso`) e
  `impactos.ts` (también liviano: lo importan el normograma, `publicacion.ts` y `operacion.ts`).
  **Ojo con los nombres de la 13C, que no son este módulo:** `/vigencia/indicadores`, el permiso
  `documentos.indicadores`, `src/lib/indicadores-documentales/`,
  `src/db/consultas/vigencia/indicadores.ts` y la acción de bitácora `exporto_indicadores`. La
  lectura de la vigencia de la persona, sus tareas y «¿es responsable técnico?» se comparten por
  petición entre el cascarón y la página con `React.cache` (`lecturaDeVigencia` de
  `src/db/consultas/vigencia/fragmentos.ts`, `tareasDePeticion` de `src/lib/tareas-peticion.ts` y
  `esResponsableTecnicoDePeticion`; Ruling 68): una página que las necesite usa esas, no otra
  lectura; quien solo necesita la insignia de «Vigencia» la cuenta en SQL (`contarVencidas`, que
  repite las reglas de `src/lib/vigencia`). Server Components por defecto; `'use client'` solo
  donde hay interactividad.
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
  (drizzle-kit lo carga sin el alias): solo rutas relativas. Al cierre de esta entrega son diecisiete
  (`drizzle/0000` a `drizzle/0016`); la `0015` alteró en su sitio las tablas vacías de la 14C y la `0016`
  añade `variable_valores.se_pide` (el periodo de un dato que alguna medición necesita).
- **Toda página autenticada lleva o hereda de su layout `force-dynamic`** (`export const
  dynamic = "force-dynamic"`; lo declaran `src/app/layout.tsx` y los layouts de
  `(app)`, `(cuenta)` y `(app)/admin/(panel)`): nunca se prerenderiza, y el build de CI no
  tiene `DATABASE_URL`.
- **Toda consulta de los módulos nuevos pasa por `alcanceProcesos()`**
  (`src/lib/alcance.ts`): el líder de proceso solo alcanza sus procesos activos; el
  filtro por rol no se reimplementa en cada módulo. La visibilidad de documentos, de
  trámites y de indicadores se decide en ese mismo archivo. Hay cuatro excepciones nombradas a
  `alcanceProcesos()`: la participación designada en un trámite y, en los indicadores (spec 14
  §6.4), la **lectura** de un indicador general, que es de toda sesión, como el normograma, la
  **designación** en un indicador (`indicador_designados`: mide, analiza o hace seguimiento), que
  da alcance sobre él sin liderar su proceso, y ser **responsable de un dato compartido**
  (`variable_responsables`, anexo 14C §4.4 y §4.7: lo ve, lo reporta y lo corrige sin liderar el
  proceso dueño). Las reglas de los indicadores son las funciones de
  `src/lib/alcance.ts` (`filtroIndicadores` para un `WHERE`, `puedeVerIndicador`,
  `puedeVerSoportes`, `puedeMedir`, `puedeAnalizar`, `puedeRegistrarHistoricos`, `puedeObservar`,
  `aprobadoresDeFicha`, `puedeAprobarFicha`, `esAprobadorDe`, `responsableDe` y `participaEn`), y
  las de los datos compartidos, las del mismo archivo (`filtroDatos` para un `WHERE`, `puedeVerDato`,
  `puedeReportarDato`, `responsablesDeDato`, `responsabilidadEnDato` y `sinResponsableDeDato`).
  La sesión de sistema de los automáticos (rol `admin_sgc`, `usuarioId` 0) no es una excepción: vive
  dentro de `tomarCalculo` (`calculos.ts`), no se exporta y nunca sirve filas a una persona, solo
  cuenta (anexo 14B, §5.5).
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
  - **Las páginas de Vigencia, del normograma y de Indicadores** llaman `exigirSesion()` y después
    su regla de alcance con `notFound()` (el patrón de `exigirDistribucion`, F13C-DC39:
    `exigirVigencia` en `app/(app)/vigencia/_comun.ts`, la pestaña visible, la revisión, el externo,
    la norma o el impacto que la persona ve; `exigirIndicador` y `exigirFichaDeIndicador` en
    `app/(app)/indicadores/_comun.ts`), nunca `exigirPermiso`: quien no la ve recibe «no
    encontrado». «Objetivos» (`/indicadores/objetivos`) es de toda sesión (`exigirSesion()`) y solo
    muestra los indicadores que la persona ve, sin decir si hay otros; `objetivos` es un código de
    indicador reservado (`CODIGOS_RESERVADOS`). «Datos compartidos» (`/indicadores/datos`, anexo 14C
    §4.7) llama `exigirSesion()` y responde `notFound()` a quien no ve ningún dato ni tiene
    `indicadores.administrar`; la página de un dato (`/indicadores/datos/[id]`) llama `exigirDato`
    (`app/(app)/indicadores/datos/_comun.ts`), que llama `exigirSesion()` y responde «no encontrado» a
    quien no ve el dato (`tests/paginas-sesion.test.ts` la admite como guarda de página). Las dos
    abren antes de leer los periodos que se piden de sus datos (`asegurarPeriodosDeDatos({ datoIds })`),
    y «Lo usan» muestra solo los indicadores que la persona ve, sin decir si hay más; `datos` también es
    un código de indicador reservado. La configuración de indicadores (`/admin/indicadores`) va con `exigirPermiso`. Los
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
    `src/app/acciones-vigencia.ts`, `src/app/acciones-normograma.ts` y
    `src/app/acciones-indicadores.ts` pasa por
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
    `api/normas/[id]/archivos`, `api/hallazgos/[id]/archivos`, `api/mediciones/[id]/archivos`,
    `api/reportes-externos/[id]/archivos` (el soporte de una constancia de envío al ente),
    `api/datos-compartidos/[id]/archivos` (el soporte de un periodo de un dato compartido; el mismo
    handler lo quita con `DELETE` y `?archivo=`) y
    `api/importaciones-indicadores/[id]/archivo` (la plantilla de un lote, solo `.xlsx` y una vez), cada una con su caso en
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
  (`validarPorVerificacion`, dentro de `cerrarVerificacion`). Quien corrige no valida a mano su
  corrección (`validarHallazgo` lo rechaza siempre), ni la cierra directamente (`cerrarHallazgo`)
  mientras haya otro Administrador del SGC activo (`exigirSinOtroAdmin`,
  `src/db/consultas/distribucion/otro-admin.ts`); si es el único, la cierra y la bitácora lo marca
  (`propioCorrector`). Con la misma regla, quien responde por el punto no cierra directamente un
  hallazgo abierto de su propio punto mientras haya otro Administrador del SGC activo; si es el
  único, lo cierra con la marca `propioPunto` (Ruling 67). La verificación siguiente del punto
  valida por el sistema, sin mirar quién corrigió; a ella solo la limita la regla de «propio
  punto» (`exigirSinOtroAdmin` al abrir y al cerrar la verificación del punto del que uno es
  responsable).
- **`archivos` admite dueños distintos de una versión** (`contexto`: `version`, `jornada`,
  `verificacion_item`, `norma`, `revision_anual`, `hallazgo`, `medicion`, `reporte_externo`,
  `importacion_indicadores` y `dato_compartido`, con `contexto_id`; los diez del `CHECK`
  `archivos_contexto_valido` de `src/db/esquema.ts`, y `CONTEXTOS_EVIDENCIA` de `src/lib/subida.ts`
  son los nueve que reciben evidencias, todos menos `version`): el control
  de acceso de un archivo es el de su
  dueño, y las consultas heredadas siguen filtrando por `version_id`. El PDF de una norma se
  lee como la norma; la foto de la corrección de un hallazgo, como el hallazgo (`filtroPuntos`);
  el soporte de una medición (PDF, imagen o `.xlsx` detectado como hoja de cálculo, nunca `.xls`) solo lo
  ve quien ve soportes (`puedeVerSoportes`, no quien solo ve el indicador: 404) y siempre se sirve como
  descarga (`src/db/consultas/indicadores/soportes.ts`); el de una constancia de envío al ente
  (`reporte_externo`: PDF o imagen, subido por `api/reportes-externos/[id]/archivos`) sigue la misma regla y se sirve
  por la misma ruta de soportes del indicador (`soporteServible`), y no se quita de una constancia registrada;
  el de un periodo de un dato compartido (`dato_compartido`, con el periodo de `variable_valores` como dueño: PDF,
  imagen o `.xlsx`, nunca `.xls`, opcional) lo suben y lo quitan, mientras el periodo no esté cerrado, quienes pueden
  reportar el dato, cada subida y cada quitada con su evento `soporte` en `variable_eventos`; lo ven quien ve el dato y
  quien ve los soportes de algún indicador con una ficha aprobada que lo cita (`puedeVerSoporteDeDato`,
  `src/db/consultas/indicadores/datos-soporte.ts`), y se sirve siempre como descarga
  (`/indicadores/datos/[id]/soportes/[archivoId]`); los demás reciben 404;
  el informe de una revisión anual (rol `evidencia`, `version_id` nula, uno por año en
  `informes/revision-<año>.pdf`) solo lo descargan Admin SGC, Gerencia y Control Interno
  (`puedeVerInformeAnual`), y los demás reciben 404; la plantilla de un lote de importación de
  indicadores (`importacion_indicadores`, una por lote y solo `.xlsx`) solo la sube y la descarga
  quien tiene `indicadores.administrar`, siempre como descarga, y quien no puede verla recibe 404.
- **Una versión deja de ser vigente solo por `aplicarPublicacion`, `anularVigenteEn` o
  `deshacerCarga`**, y los tres llaman `alDejarDeSerVigente`: marca sus copias controladas
  como «por recoger», supera sus acuses pendientes y su socialización requerida. Ninguna otra
  ruta cambia ese estado. La adopción de una edición de un externo publica por
  `aplicarPublicacion` y su retiro anula por `anularVigenteEn` (motivo `retirado`): en la app no
  hay un cuarto llamador. La única excepción es la semilla demo: `src/db/semillas/distribucion-demo.ts`
  llama `alDejarDeSerVigente` directamente porque la semilla de trámites publica por SQL.
- **La fecha base de la próxima revisión depende del origen** (`fechaBase`,
  `src/lib/vigencia/plazo.ts`; F13C-DC31): un interno publicado en la plataforma cuenta desde su
  publicación; uno aprobado fuera, desde su `fecha_aprobacion`, nunca desde `publicado_en` (la
  carga directa lo escribe con la fecha de carga); en los dos, una ratificación posterior manda.
  Un externo cuenta desde su última verificación o, sin ella, desde su adopción. La fecha
  fijada a mano reemplaza a la calculada, y publicar una versión nueva la borra junto con las
  marcas del aviso (`aplicarPublicacion`). El plazo y la periodicidad se suman en meses
  calendario (`sumarMeses`) y el estado se calcula, nunca se guarda (`columnasDeVigencia`).
- **La revisión anual** (`src/db/consultas/vigencia/revision-anual/`): los actos que deciden
  fuera de su página (ratificar, verificar, adoptar o retirar un externo, pedir una solicitud)
  registran la decisión dentro de su propia transacción, a nombre de quien actuó
  (`registrarDecision`, `registro.ts`), y deshacer una carga saca al documento de la foto, también
  a nombre de quien actuó (`sacarDeLaFoto`, desde `deshacerCargaEn`). Publicar no decide: un
  documento que no estaba en la foto (una creación publicada, una carga nueva, un externo
  adoptado por primera vez) entra como «revisado recientemente», a nombre del sistema
  (`alPublicarDuranteRevision`, desde `aplicarPublicacion`), y el que ya estaba conserva su
  decisión. El orden de candados es
  la revisión primero (el acto la lee `FOR SHARE`; el cierre y la prórroga la toman
  `FOR UPDATE`) y las filas hijas después. El informe se congela al cierre
  (`revisiones_anuales.informe`) y su PDF se genera al primer pedido, como el acta:
  `asegurarInforme` (`src/db/consultas/vigencia/informe.ts`) repite a propósito el algoritmo
  de `asegurarActa` (F13A-R17), y un cambio de su invariante va en los dos.
- **Tests contra la BD de desarrollo:** todo usuario de prueba que genere filas en
  `auditoria`, `accesos`, `firmas`, `tramite_eventos`, `copia_eventos`, `acuse_eventos`,
  `ratificaciones`, `externo_verificaciones`, `norma_cambios`, `medicion_eventos`,
  `medicion_observaciones`, `importaciones_indicadores`, `importacion_eventos`, `reporte_externo_eventos` o `variable_eventos` usa un nombre único por corrida
  (`zz_<algo>_${Date.now()}`) y no se borra (FK `RESTRICT` y trigger de solo inserción).
  Nunca `DELETE` ni `UPDATE` sobre esas tablas en una limpieza. Un test que escribe datos
  capaces de bloquear la migración o el arranque, o de romper otros tests (un usuario duplicado, la
  configuración de la entidad), los escribe dentro de una transacción que se revierte o
  los restaura en `finally`: un test que falla no debe dejar la base inservible. Ningún test
  deja confirmada una revisión anual (cerrada ya no se modifica y su año es único): la abre y la
  cierra dentro de la transacción revertida, en un año lejano, y antes cierra la que esté
  abierta (`sinRevisionAbierta`, `tests/utiles/vigencia.ts`). Tampoco deja confirmado un cierre
  del mes de indicadores (no se borra y su mes es único) ni una ficha aprobada (su versión ya no
  cambia y su firma no se borra) ni un lote de importación importado (no se borra): los hace dentro
  de una transacción que se revierte, y los del cierre, en un año lejano del pasado con `ahora`
  inyectado.
- **Transiciones del trámite:** la firma se verifica fuera de la transacción y lo que puede
  fallar va antes, en un validador de solo lectura (F13A-R4); `opciones.ahora` es la hora de
  todo lo escrito (F13A-P1). `transicionar` guarda en el `detalle` de cada evento que cambia de
  etapa la fecha límite de la etapa que cierra (`venceEn`), y `reasignar` usa esa misma clave
  para la fecha nueva: una acción nueva que no cambie de etapa entra en
  `EVENTOS_SIN_CAMBIO_DE_ETAPA` (`src/lib/tramites/dia-de-etapa.ts`), o el indicador de etapas en
  plazo la contaría. Ese indicador mide el avance del trámite: no cuenta los pasos que lo terminan
  sin avanzarlo (`retirar`, `cancelar`, `rechazar`, `negar_visto_bueno` y `negar_eliminacion`,
  `ACCIONES_QUE_TERMINAN` de `src/db/consultas/vigencia/indicadores.ts`; Ruling 66), y una acción
  nueva que termine el trámite entra en esa lista.
- **Firmas sin trámite:** «Ratificó» y «Adoptó» se guardan con `registrarFirma` con
  `tramiteId: null` y `ronda = 0`; el cierre de la revisión anual pide la clave igual y guarda
  su método en la revisión (`metodo_cierre`), sin fila en `firmas`. Los tres siguen F13A-R4: un
  validador de solo lectura antes (`validarRatificacion`, `validarAdopcion`, `validarCierre`),
  la clave con `verificarParaFirmar` fuera de la transacción y las comprobaciones repetidas
  dentro con `FOR UPDATE`. Ratificar, y adoptar una edición con archivo, recalculan la huella
  del archivo en disco (`exigirHuellaRegistrada`); si no es la registrada, nada se escribe y el
  rechazo queda en la bitácora, fuera de la transacción (`conRechazoPorHuella`,
  `src/db/consultas/vigencia/comun.ts`). Las firmas de una ficha de indicador («Elaboró» al
  enviarla a aprobación o al publicar un cambio menor, y «Aprobó») van también en `firmas`, con
  `indicador_version_id`, `tramite_id` y `version_id` nulos, `ronda = 0` y como huella el SHA-256
  del contenido firmado de la versión (`huellaDeFicha`, `src/lib/indicadores/ficha.ts`); siguen
  F13A-R4 (`validarEnvio` y `validarAprobacion`, `src/db/consultas/indicadores/aprobacion.ts`). El
  acta y `listarFirmas` filtran por trámite y no las ven.
- **La ficha de un indicador** (`src/db/consultas/indicadores/`, spec 14 §7): la sigla `IND` está
  reservada y no es un tipo de documento (`mapa-admin.ts` la rechaza), para que `SGC-IND-01` no
  se confunda con un `PROCESO-TIPO-NN`; desde la entrega complementaria (spec 14A) la sigla `ID`
  también está reservada y el código de una ficha nueva es `SIGLA-ID-NNN` (tres cifras, contado por
  sigla y sin reusarse), con la sigla del subproceso si la tiene (opcional y única entre procesos y
  subprocesos, de 2 a 4 letras; el subproceso la recibe al editarlo en el mapa o al importar un
  lote, `asignarSiglaASubproceso`) y, si no, la del proceso; los `-IND-` antiguos siguen valiendo. Una versión guarda, junto a la referencia, el nombre con
  que se firmó cada catálogo que cita (tipo, clasificación, unidad, objetivo, proceso, subproceso,
  cargos y normas), y la huella va sobre esos textos: renombrar un cargo, una unidad o un proceso
  no cambia una ficha aprobada. Un indicador enviado alguna vez a aprobación no se borra: se
  descarta y su código sigue ocupado. Los **históricos** (periodos que terminaron antes de la
  primera aprobación) no generan tareas, avisos ni la marca «Requiere acción de mejora», y no
  cuentan ni rompen la racha del incumplimiento repetido.
  **Importar un lote** (spec 14A §5, `importacion.ts`): la plantilla es la de la app
  (`plantillaDeImportacion`, 26 columnas en `columnas.ts`), una por lote y en el almacén; la vista
  previa revisa cada fila (`revisarLote`) y pide las correspondencias de subproceso, cargo, tipo y
  unidad; importar pide la clave (F13A-R4: validador de solo lectura, `verificar` fuera de la
  transacción y todo repetido dentro con el lote bloqueado) y es todo o nada para las filas sin
  problemas. Cada lote lleva su aprobación previa (documento, quien aprobó y fecha) y una regla de
  rangos única (Atención desde el 90 % de la meta en ascendente y hasta el 110 % en descendente,
  por omisión); las «Aprobado» entran aprobadas con `importacion_id` y `aprobacion_previa_*`, sin
  firma «Aprobó» ni aviso (la constancia con clave es el evento `importado`, no `firmas`); las
  «Propuesto» son borradores normales, sin esas columnas; los periodos que terminaron antes de
  importar son históricos. «Deshacer» es del lote entero y su única excepción al trigger de las
  versiones aprobadas es la de la regla 5; las tablas de la 14B que cuelgan de una ficha
  (`impactos_indicadores` y `reportes_externos`) ya están en `condicionDeDeshacer`, y una de la 14C
  que cuelgue de una ficha del lote añade allí su motivo. Lo importado es siempre manual y sin ente
  (la plantilla no los trae): ponérselos después es un cambio, que sí pasa por `alPublicarVersion`.
- **Fórmulas:** una fórmula de indicador solo se evalúa con el intérprete de
  `src/lib/indicadores/formula/` (gramática cerrada, fracciones exactas con `bigint`, límites de
  longitud, profundidad y cifras); nunca `eval`, `Function` ni SQL armado con texto del usuario.
- **Lo que calcula el sistema** (anexo 14B, §4 y §5): los cálculos automáticos son la lista fija del
  registro (`CALCULOS`, `src/lib/indicadores/calculos/registro.ts`, diez); el formulario manda una
  clave y un alcance y el servidor los valida contra él y pone la forma, la fórmula, las variables y
  la tendencia del registro. Ninguna fórmula ni texto de la persona llega a SQL. Los documentales los
  toma `tomarCalculo` llamando la consulta de Vigencia con la sesión de sistema (cuenta como el Admin
  SGC). A lo sumo una ficha activa por cálculo y alcance (con alcance «proceso», por proceso): el
  indicador guarda el cálculo y el alcance de su ficha vigente y el índice único parcial
  `indicadores_calculo_unico` lo garantiza (`alPublicarVersion` los escribe). El mensaje «Ya hay una
  ficha activa para ese cálculo y alcance» lleva el código de la otra solo a quien puede verla
  (`puedeVerIndicador`); a quien no, el mismo mensaje sin el código. **Un automático no lo
  digita nadie:** reportar, «no aplica», históricos y soportes rechazan una medición cuya versión que
  rige es automática; al aprobarse una versión automática se quitan los designados «mide» y se apaga
  el soporte obligatorio. Mientras espera su valor está en **«Falta un dato»**: no es tarea de nadie,
  no avisa, no vence ni escala (`esperaUnDato` de `src/lib/indicadores/origen.ts`, la regla única, que
  vale también para lo que espera un valor ajeno; `queFalta`, `tareas.ts`; los pasos de
  `vencimientos.ts`). **La foto**
  (`fotos.ts`): la de un cálculo de estado, al terminar el periodo y solo del más reciente que
  terminó; la de flujo, al vencer el plazo de reporte; la histórica de un cálculo que se llena hacia
  atrás, sin esperar (`cuandoSeToma`, `src/lib/indicadores/fotos.ts`). La toman la pasada de
  vencimientos (después de abrir los periodos) y, antes de clasificar, el resumen y el cierre del mes;
  la apertura de periodos no. Sin nada que medir (B en cero), «No aplica» con el motivo del cálculo
  (`fotoDe`). La foto que deja la medición pidiendo análisis le cuenta la fecha límite otra vez
  desde ella, con el mismo plazo, si es de flujo o si esa fecha ya pasó al tomarla (la pasada solo
  corre cuando alguien usa la aplicación; con plazo 0, siempre), para que el análisis no nazca
  vencido (`laFotoMueveElPlazo`, `src/lib/indicadores/fotos.ts`). La de estado tomada a tiempo, y
  la que cumple o queda «No aplica», no la mueven. «Volver a calcular» (solo flujo, sin cerrar ni reabrir,
  de quien administra) la mueve una vez como mucho. Una medición cerrada no se recalcula nunca en
  silencio.
- **Un solo camino de cálculo:** solo `recalcularMedicion`
  (`src/db/consultas/indicadores/mediciones.ts`) escribe el resultado, el semáforo, la meta
  aplicada y el estado de una medición abierta o reportada; reportar, registrar históricos,
  corregir, marcar «no aplica», reprogramar la meta, subir o quitar un soporte, reabrir, la foto y
  la propagación pasan por ella, con la fila bloqueada. **No refresca valores por sí misma:** calcula
  con los que la medición tiene, y los que nadie digita los escriben solo `tomarFotos` y
  `volverACalcular` (`fotos.ts`) y `propagar` (`propagacion.ts`: el valor de un dato compartido,
  juntado a la periodicidad del indicador, y el de un componente, su resultado o su cumplimiento, o
  su acumulado si es más fino, `valorDeComponente`; anexo 14C, §3.2, §3.3 y §6.3) y, en un indicador
  desagregado, el total (`escribirTotal`, al reportar la rejilla o al propagar), en `medicion_valores` y sin
  usuario (`reportado_por` nulo). Cada escritor toca lo suyo: el de la persona, solo sus variables
  propias (en un histórico, todas); la propagación, solo las ajenas. El valor que copia el sistema
  va con cuatro decimales y, si no cabe exacto en ellos, también con su fracción (`valor_exacto`,
  «n/d»), que solo escribe el sistema y el cálculo prefiere (`elegirValores`). La propagación es una
  pasada idempotente con la forma de `tomarFotos` (compara lo copiado con la fuente y solo escribe
  si difiere; una transacción por medición, y la que falla se registra y se reintenta; por nivel de
  dependencia, `nivelesBajo` ascendente, así un compuesto de compuestos queda al día en una
  llamada; si un componente no aplicó, el compuesto queda «No aplica» con
  `MOTIVO_COMPONENTE_NO_APLICA`, y la propagación lo quita cuando vuelve a aplicar) que corre en
  tres momentos: justo después de la acción que cambia una fuente (`propagarSinFallar`, fuera de su
  transacción), en la pasada de vencimientos (después de las fotos y de abrir los periodos de los
  datos) y, antes de clasificar, en el resumen y el cierre del mes (`abrirPeriodosDelCierre`). La
  medición que depende lee su fuente sin candado: nunca la bloquea. El cierre del mes y «Cerrar de nuevo»
  solo la pasan a `cerrada` (`src/db/consultas/indicadores/cierre.ts`). Cuando cambia el semáforo o
  el resultado de una medición ordinaria, ella misma recalcula la racha de las n − 1 siguientes
  medidas sin cerrar (`recalcularSiguientes`, evento `recalculo`, F14A-R53), y cambiar el plazo o
  «soporte obligatorio» llega a las mediciones en curso (`cambiarOperacion`, F14A-R52). Un
  recálculo que no nace de un cambio en la medición (esos dos y la propagación) es de sistema
  (`sistema: "racha"`, `"soporte"` o `"fuente"`): no la mueve de la versión con que se congeló al
  reportarla (el de una fuente, solo si ya tenía resultado: `versionesDeCalculo`), su evento dice qué
  pasó con la marca, y el de la racha o el de una fuente no reabre por falta de soporte lo ya
  reportado. **El soporte
  obligatorio rige hacia adelante:** activarlo solo alcanza las mediciones aún en plazo. También
  escribe `cumple`: alcanzar la meta no es lo mismo que estar en Bien, porque con rangos escritos
  (forma B, spec 14A §3) Bien puede empezar antes de la meta; una medición anterior a la `0012`
  tiene `cumple` nulo y se lee como antes (Bien ⇔ cumple, `cumpleDeFila`).
- **La medición desagregada** (anexo 14C, §5; `mediciones.ts` y `categorias.ts`): cada medición ordinaria de
  una versión con dimensión congela al abrirse su lista de categorías (`mediciones.categorias`:
  `listaDelPeriodo`, con el maestro leído `FOR KEY SHARE` en la transacción que la guarda, porque el `jsonb`
  no tiene llave foránea y `borrarCategoria` toma la categoría `FOR UPDATE` antes de ver si está usada);
  una histórica no lleva lista (se digita el total, §3.6). **Qué categorías tiene la lista** solo cambia por
  «Actualizar categorías» (`actualizarCategorias`, de quien administra, en una abierta sin reportar: solo
  añade) o cuando un cambio mayor cambia la dimensión (`rehacerCategorias`, desde `aprobarFichas`: rehace
  las abiertas sin reportar de su tramo y borra sus valores); una reabierta conserva la suya. Los «No
  aplica» de fila los escriben en la lista el reporte, la propagación y `rehacerCategorias`. Se reporta
  una rejilla: cada celda es una fila de `medicion_valores` con `categoria_id`. **El total es la fila sin
  categoría y lo escribe solo el sistema** (`escribirTotal`, la suma de las filas que no están «No
  aplica», en las variables de la versión con que se calcula: tras un cambio menor reescribe cada letra en
  la suya): la persona escribe solo las celdas que cambió, nunca el total, y qué cambió lo decide el
  servidor con los originales que pinta el formulario (`o_<categoría>_<letra>`, `ona_` y `omotivo_`;
  `EsquemaFilaDeRejilla`), así dos personas guardan partes distintas sin pisarse. «Guardar sin reportar»
  vale solo antes de reportar, como en cualquier medición (`YA_REPORTADA`): ya reportada se corrige con
  «Reportar», y la corrección deja en su evento cada celda que cambió. Con el total calculan el semáforo,
  la racha, la tabla del año, el acumulado y los Excel, sin cambios. Con todas las filas «No aplica», la
  medición queda «No aplica» con `MOTIVO_TODAS_NO_APLICAN`, que quita el siguiente reporte con una fila
  medida o la propagación; una fila que ningún periodo de su dato por categoría trae queda «No aplica» con
  `MOTIVO_DATO_SIN_CATEGORIA` (nunca se pisa el de una persona), que quita la propagación cuando el dato
  pasa a traerla (si a esa fila le faltan las celdas propias de un mixto reportado, se le devuelve el
  reporte a quien mide, con la regla del plazo de `plazoPorLaFuente`) o `rehacerCategorias` cuando un
  cambio mayor ya no trae el dato. `recalcularMedicion` escribe `categorias_en_critico` (las filas
  completas en Crítico, con la versión y la meta de la medición; nulo sin resultado o sin lista), y el
  desglose (`desgloseDe`) calcula cada fila al leer: nunca se guarda. **Una categoría en Crítico avisa**
  aunque el total no avise: con el total en Bien y cumpliendo, el nivel `bien_con_critico` de `alertas.ts`
  (a quienes reciben los de Atención, también cuando lo deja la propagación); la alerta y la «Corrección»
  nombran las categorías en Crítico; no exige análisis ni pone «Requiere acción de mejora», y entra a la
  «Corrección» como un nivel más.
- **El cierre conoce las entradas y la reapertura va en cascada** (anexo 14C, §3.5; `cierre.ts`,
  `dependencias.ts` y `reapertura.ts`). **Una medición cerrada tiene cerradas todas sus entradas:** lo que
  usó su valor, por la versión con que se calculó o, sin resultado, por la que rige (`revisarFuentes` y
  `entradasDe`: los periodos del dato que se juntan, por categoría en un desagregado, y las mediciones del
  componente que entraron a su valor; mientras la fuente no lo tiene, las que se esperan, sin los históricos
  que nadie registró). Una histórica no tiene entradas. La única excepción es la del retirado: su medición
  cerrada no se reabre cuando su fuente se reabre y se corrige, y queda como estaba (a ella tampoco se le
  pide que lo copiado coincida: no recibe la propagación). El cierre abre antes los periodos de los datos
  (`asegurarPeriodosDeDatos`, antes de las fotos) y propaga después; **cierra también los periodos de los
  datos** que terminaron en el mes o antes (los reportados, aunque ya no se pidan, y los pendientes que se
  piden y vencieron, sin valor: «Sin dato»), no los pendientes en plazo ni los que ya nadie pide
  (`se_pide` falso); y **no cierra («espera»)** la medición con una entrada que no está cerrada ni se
  cierra en ese mismo cierre, ni la de un indicador activo cuyo valor copiado ya no coincide con su fuente.
  La espera se contagia hacia arriba (por niveles, hasta que no cambie, en memoria y con todo bloqueado
  antes del `UPDATE`), y el resumen la dice (`esperanEntrada`, `datos`). Quién debía lo que quedó «Sin
  dato» sale de la regla única de «Falta un dato» (`esperaUnDato`, `src/lib/indicadores/origen.ts`, la
  misma de la lectura, la lista y las tareas): quienes miden, los responsables del dato o el indicador
  componente. «Cerrar de nuevo» una medición no la cierra con su fuente abierta ni, en un indicador activo,
  con lo copiado distinto de su fuente (propaga antes lo de su indicador); un periodo reabierto de un dato
  se cierra de nuevo con `cerrarDeNuevoElDato`. **La reapertura en cascada** (`reabrirEnCascada`;
  `reabrirMedicion` delega en ella cuando la medición tiene dependientes cerradas): reabrir un periodo
  cerrado de un dato (también para reportarlo tarde) o la medición cerrada de un componente reabre en una
  transacción cada medición cerrada que lo usó y las que dependen de esas (`dependientesDe`), salvo las de
  un indicador retirado o de otra periodicidad, que no se tocan; la lista se ve antes de confirmar
  (`listaDeReapertura`, maqueta 13) y se confirma lo que se vio: los dos diálogos mandan siempre lo que listaron
  (`vistas`; el sencillo de una medición sin dependientes, ella sola; el de un dato sin ninguna, la lista vacía), las
  dos acciones lo exigen (`EsquemaReapertura`) y, si con todo bloqueado no es lo mismo, no se reabre nada. Cada una queda «Corregida» con el único `UPDATE`
  que el trigger admite, su evento `reapertura` (`detalle.porFuente = { clase, id }`, nunca el nombre de la
  fuente: el historial la nombra al leer, `fuenteEnTexto`, solo a quien puede verla), su aviso (que la nombra
  solo a quien puede verla, por destinatario; a los demás, «un componente» o, si es un dato, «una de sus
  fuentes») y su bitácora (sin nombres: «por un cambio en un componente» o «… en un dato compartido»); el
  periodo del dato vuelve a `reportado` o a `pendiente`, `corregido` (su plazo y sus marcas de aviso no se
  tocan), con su evento (con `propioResponsable` si quien reabre también lo reporta), el aviso a sus
  responsables (`indicadores.dato_reabierto`, salvo a quien reabre) y su bitácora (`dato_reabierto`). Una
  constancia de envío al ente no cambia. **Orden de candados del cierre y de la cascada**, el mismo en los
  dos: **0.** el candado consultivo del cierre (`serializarCierreYReapertura`, `reapertura.ts`), la primera
  sentencia de la transacción de todo lo que cierra o reabre (`cerrarMes`, `reabrirEnCascada`, el camino directo de
  `reabrirMedicion`, `cerrarDeNuevo` y `cerrarDeNuevoElDato`; vive en `candado-del-cierre.ts`, liviano): es él, y no la relectura con todo bloqueado, lo que impide que un cierre decida con una
  entrada que una reapertura cambia a la vez; toda lectura que decide va después de él, en la misma
  transacción (lo que se lee antes solo elige el camino o pinta, y se lee otra vez dentro); **1.** los
  periodos de los datos `FOR UPDATE`, por id (sin la fila del dato); **2.** los indicadores `FOR SHARE`, por
  id; y **3.** las mediciones `FOR UPDATE`, por `indicador_id, desde, id` (la cascada, de cada indicador todas
  desde la más temprana que reabre: `recalcularSiguientes` bloquea las siguientes). Un `40P01` llega legible
  a la persona (`sinInterbloqueoDelCierre`).
- **El cumplimiento de un porcentaje con meta se decide con la razón exacta, en enteros**
  (`cumplePorcentaje`, `src/lib/indicadores-documentales/metas.ts`; `conformidad`,
  `src/lib/distribucion/verificacion.ts`), nunca con el entero que se muestra. `conformidad()`
  muestra el porcentaje truncado, así la cifra entera nunca contradice el veredicto, y es la
  misma cifra en Distribución, los indicadores y el informe anual (`porcentajeDeConformidad`);
  los demás indicadores redondean y, cuando el entero contradiría el veredicto,
  `textoPorcentaje` (`textos.ts`) muestra un decimal truncado. En el módulo de Indicadores la regla
  vale para todo indicador, no solo los porcentajes: el semáforo compara la fracción exacta
  (`Fraccion`, `src/lib/indicadores/formula/fraccion.ts`) y la cifra que se muestra nunca lo
  contradice (`textoValor`, `src/lib/indicadores/textos.ts`: redondea a los decimales de la ficha
  y, si eso contradijera el color, trunca, con más decimales si hace falta). «Cumple» es alcanzar
  la meta y se decide con la misma razón exacta (`cumpleMeta`); un Bien que no la alcanza lleva su
  etiqueta propia, avisa como un Atención y pide análisis (spec 14A §3.1).
- **Una sola meta** (anexo 14B, §6; `fichas-de-calculo.ts`): la meta de una tarjeta de Vigencia y de
  cada fila de «Dentro del plazo, por proceso» sigue la cadena ficha activa del proceso → ficha activa
  de la entidad → Configuración documental, con la meta que rige el periodo en curso de la ficha (la
  programada, si la hay); el Excel de la pestaña usa lo mismo. Distribución juzga la conformidad con
  `metaDeConformidad()`: la meta de la ficha activa de `conformidad_fecha` de la entidad o, sin ella,
  el umbral de Configuración documental; la usan `estadoDePuntos` e `historialVerificaciones` y, por
  ellos, la tarjeta. El informe de la revisión anual **no** usa el umbral ni guarda veredicto. El
  código de la ficha solo se muestra a quien puede verla (la meta se aplica igual). Configuración
  documental muestra en solo lectura la meta que fija una ficha de la entidad
  (`metasQueFijaUnaFicha`) y el guardado conserva el valor guardado. Las fichas de los siete cálculos
  con tarjeta exigen meta entera (`metaNoEntera`, también en las metas programadas), porque Vigencia
  y Distribución deciden en enteros; la de `conformidad_fecha` exige meta.
- **Constancias de envío al ente** (anexo 14B, §8; `constancias.ts`): «se reporta a un ente» es un
  estado completo (ente, periodicidad externa que contiene a la de medición y plazo, `errorDeEnte`).
  Nacen (`asegurarConstancias`, desde la pasada y la página) para los periodos externos que terminan
  después de `indicadores.ente_desde`, que escribe `alPublicarVersion` cuando la versión nueva se
  reporta y cambió lo que dice del ente (una ficha que ya se reportaba antes de la 14B empieza a contar
  en la primera pasada que la ve); lo ya nacido no cambia (guarda su ente y su fecha límite). Dejar de
  reportarse o retirar el indicador quita solo las pendientes sin soporte ni historial
  (`quitarConstanciasSinSoporte`); la pendiente sin soporte que se conserva porque tiene historial no
  se pide si la ficha ya no se reporta: ni tarea, ni avisos de vencido y de escalamiento, ni la marca
  y el filtro de la lista. Las tareas, los avisos y la lista usan el mismo fragmento
  (`constanciaQueSePide`, `constancias-soporte.ts`: pendiente, de un indicador activo y, con
  `ente_desde` nulo, solo si tiene soporte); la pendiente con soporte se sigue pidiendo. Registrar
  congela el resultado del periodo externo con el mismo acumulado de la página (`resultadoDelPeriodoExterno`, parcial si falta un dato, hay periodos sin
  cerrar o acumula desde una versión nueva); corregir exige justificación y no lo recalcula. Registran
  y corrigen, sin clave, quien puede medir y quien administra (`puedeRegistrarConstancia`); el retiro
  no lo impide, pero sí subir o quitar soportes, y el de una registrada no se quita. Su historial es
  `reporte_externo_eventos` (regla 5). Vencen, avisan y escalan en su propia pasada
  (`constanciasVencidas`, con `correrPaso` de `pasada.ts`), sin aviso previo y sin nombrar el
  indicador al jefe.
- **Revisiones de indicadores por cambio de norma** (anexo 14B, §9; `impactos.ts`, tabla
  `impactos_indicadores`): nacen en la transacción del cambio de estado de la norma
  (`crearImpactosDeIndicadores`, desde `cambiarEstadoEn`), una por indicador activo cuya ficha vigente
  la cita, y se resuelven **en la página del indicador**, no en la de impactos de la 13C (que las
  muestra en lectura, `indicadoresDelCambio`): «No afecta» con nota (`resolverImpactoNoAfecta`), la
  primera versión enviada (o el cambio menor publicado) después de nacer la revisión, al aprobarse
  (`resolverImpactosPorVersion`, desde `alPublicarVersion`), o el retiro (`resolverImpactosPorRetiro`).
  Son tarea de quien administra indicadores y vencen en su propia pasada
  (`impactosDeIndicadoresVencidos`, calcada a propósito de la de la 13C: un arreglo de esa mecánica va
  en las dos). Solo una cita **nueva** exige norma vigente o modificada (`revisarContraLaBase` compara
  contra la versión vigente); al aprobar, o al publicar un cambio menor, una cita nueva de una norma
  que dejó de regir se rechaza (`normaNuevaQueNoRige`). Crear las revisiones no toma candados
  explícitos sobre `indicadores`: el `40P01` que puede cruzarse con quien guarda una ficha lo vuelven
  legible las acciones (`legibleSiInterbloqueo`).
- **Tests y demo:** `tramiteEn` crea su documento: ningún test abre un trámite sobre uno de
  la demo. `tests/semilla-tramites.test.ts` lee el estado de la demo y salta con mensaje si
  ya avanzó; `SEMILLA_RECIEN=1 npm test` exige la demo recién sembrada. La demo trae fichas
  automáticas activas (`objetivos_cumplidos` de calidad en `SGC-IND-03`, `reportes_a_tiempo` del SGC
  y `conformidad_fecha` de la entidad): un test que crea una ficha automática libera antes ese cálculo
  y alcance (`liberarCalculo`; `sinFichasDocumentales` si lee metas de Configuración documental, el
  umbral o las tarjetas), y uno que corre la pasada de vencimientos silencia lo ajeno, también las
  fotos (`silenciarIndicadores`), siempre dentro de su transacción revertida. La semilla siembra por
  las funciones del dominio con `ahora` inyectado (`indicadores-demo-agenda.ts`, pura, y
  `indicadores-demo-14b.ts`).

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
