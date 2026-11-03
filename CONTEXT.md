# CONTEXT.md — Estado vivo del proyecto

> Se actualiza al cierre de cada fase. Última actualización: **2026-11-03**
> (sesión de diseño de **SGC Integral**: documento maestro **aprobado** por el usuario;
> fases 11–20 definidas en `PLAN.md`). La variante nació el mismo día, bifurcada de
> `sgc-suaza` en `9644ceb`.
>
> ⚠️ **La sección "Restricciones INVIOLABLES (hardware)" de `AGENTS.md` está
> desactualizada**: describe el QNAP. Manda §4 del spec
> `docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` hasta que la
> Fase 11 la reescriba.

## ⏸ Punto de reanudación (próxima sesión)

0. **Qué es este proyecto:** SGC Integral es la variante ampliada de SGC Documental
   (`sgc-suaza`). El usuario decidió el 2026-11-03 dejar la app original tal como está,
   con sus funcionalidades, y construir aquí otra con **funcionalidades más completas**.
   La original vive en `F:\sgc` (repo `juanfyru/sgc-suaza`) y **no se toca desde este
   proyecto**.
1. **Dónde quedamos:** la variante nació como clon completo con historia (91 commits de
   las Fases 0–10) en `F:\sgc-integral`. Repo destino `juanfyru/sgc-integral` (privado),
   **pendiente de crear en GitHub y hacer el primer push**; el remoto `origin` ya apunta
   ahí. Cambios
   de la bifurcación: nombre de paquete, imagen y artefacto `sgc-integral`; puertos de
   desarrollo propios; job de imagen ARM64 manual en el CI. **Verificado en BD nueva:**
   migraciones y semilla (mismos conteos: 4 macros, 19 procesos, 56 subprocesos, 28
   documentos), lint limpio, **205/205 tests en verde**, build limpio, mapa e ingreso
   al panel admin en el navegador.
2. **Lo que sigue:** el diseño maestro
   `docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` fue **aprobado
   por el usuario el 2026-11-03** (tras una ronda de revisión de un subagente
   constructor). (a) Escribir la spec y el plan de la **Fase 11 — Fundación de acceso**
   (skill `writing-plans`) y ejecutarla; arranca subiendo Next 16.2.10 → 16.3.x.
   (b) Pendiente operativo: crear el repo `sgc-integral` en GitHub, privado y **vacío**,
   y correr `git push -u origin main`. Las fases 11–20 están en `PLAN.md` §Fases de la
   variante y siguen la metodología de `AGENTS.md`. Insumos que dependen del usuario:
   spec §11 (SMTP, versión de Windows, planta de cargos, plantilla del plan de
   mejoramiento, total de cuentas, etc.).
3. **Entorno de desarrollo** (convive con `sgc-suaza` en la misma máquina):

   | Pieza | SGC Integral (esta) | sgc-suaza (original) |
   |---|---|---|
   | Carpeta | `F:\sgc-integral` | `F:\sgc` |
   | Postgres dev | `sgc-integral-bd-1`, `127.0.0.1:5435` | `sgc-bd-1`, `127.0.0.1:5434` |
   | `npm run dev` | `http://localhost:3002` (fijo en el script) | 3000 |
   | App en Docker (compose dev) | 9081 | 9080 |

   En esta máquina 5432 lo ocupa un Postgres nativo, 5433 y 3001 el proyecto doctime.
   **BD nueva desde cero:** `docker compose -f docker-compose.dev.yml up -d bd` →
   `npm run db:migrate` → `npm run db:seed` → **`npm run admin:asegurar`** (crea
   `admin`/`cambiar-esta-clave`; `next dev` no lo crea solo, en el contenedor lo hace
   `arrancar.js`). Node 24 en todo; no bajar a 22.
4. **Tests:** con la BD de la variante recién sembrada pasan **todos**. Los 5 rojos que
   arrastra `sgc-suaza` vienen de documentos manuales (`PR-GTH-990/991`) que solo
   existen en la BD de ese proyecto; aquí cualquier rojo es una señal real.
5. **CI (decisión de la bifurcación, tomada por Claude):** lint y build corren en cada
   push; el job de imagen ARM64 (GHCR + artefacto `.tar`) solo corre con **Actions →
   CI → Run workflow**. Motivos: el destino de despliegue de la variante no está
   definido, la cuota de almacenamiento de Actions es de la cuenta y la comparte con
   `sgc-suaza` (se agotó el 2026-08-25), y cada build ARM64 por QEMU es lento. Para
   cumplir "verificar ARM64 desde temprano" de `AGENTS.md`, lanzarlo a mano al cierre de
   cada fase que agregue dependencias, o reactivar el disparo automático cuando la
   variante tenga destino.
6. **Despliegue: decidido en el spec §4** (contenedores portables, Windows con WSL2 o
   Linux, tres contenedores proxy+app+bd; se construye en la Fase 20). Lo que sigue
   describe los archivos heredados del NAS, que esa fase reemplaza. Los archivos de despliegue (`docker-compose.nas.yml`,
   `INSTALACION*.md`, `nas/`) se heredaron con el nombre de imagen y artefacto ya
   cambiado, pero conservan el puerto 9080, los nombres de contenedor `sgc-app`/`sgc-bd`
   y la carpeta `/share/sgc-documentos` del original. Si la variante va a **convivir**
   con la original en el mismo QNAP, hay que cambiar esas tres cosas antes de instalar
   (y revisar el presupuesto de ~2 GB de RAM, que no alcanza para dos pares app+BD). Si
   la **reemplaza**, sirven tal cual. El ensayo local (`docker-compose.ensayo.yml`)
   también publica 9080, que en esta máquina ocupa `sgc-app-1` de la original: apagar
   ese contenedor antes de ensayar desde aquí.
7. **Marca visible:** la UI todavía dice "SGC Documental" (`src/app/layout.tsx` y el
   encabezado). Decidido: la marca (nombre, logo, colores) pasa a ser configuración por
   entidad en la Fase 12 (spec §5.10).
8. **Pendientes heredados del usuario** (siguen valiendo aquí): convención oficial de
   códigos (`patron_codigo` en `/admin/mapa/textos`), documentos reales aprobados, logo
   institucional vectorial. **Deuda técnica heredada:** subir Next 16.2.10 → 16.3.2+
   por advisories; job de CI con Postgres de servicio para los tests de BD.
9. **Memoria de Claude Code:** es por carpeta, así que `F:\sgc-integral` arranca sin
   memoria propia. Este archivo es el contexto durable de la variante.

## Herencia: fases 0–10 de sgc-suaza (estado al bifurcar)

> Todo lo que sigue es el registro del proyecto original hasta `9644ceb`. Los pendientes
> operativos que menciona (cuota de Actions, día de instalación, F10-D1) son de
> `sgc-suaza`, no de esta variante. Las decisiones D1–D10 y las de cada fase siguen
> vigentes aquí salvo las que el spec de SGC Integral marca como superadas (§4.2: D3
> parcial, D4 opcional, D8 ampliada, F9-D1, F10-D6, reglas de hardware 1–3 y 5, reglas
> de negocio 3 y 4).

### Estado al bifurcar

- **Fase actual:** 10 — completada en `main` (2026-08-25). Paquete de despliegue NAS:
  arranque del contenedor con migraciones (`src/lib/arranque.ts` + `scripts/arrancar.ts`
  bundleado con esbuild al build de la imagen; CMD `node arrancar.js && exec node
  server.js`), `docker-compose.nas.yml` (mem_limit 768M/512M, bd sin puertos, healthcheck
  `/api/salud`) + `.env.nas.example`, doble tag del tar en CI para rollback offline,
  `nas/respaldo.sh`/`restaurar.sh` (crontab QTS, retención 30 días), ensayo local
  destructivo con restauración probada (`docker-compose.ensayo.yml` + `.env.ensayo`),
  `scripts/carga.ts` (presupuestos de rate limit por IP única) e `INSTALACION.md`
  operable por sistemas. Tests nuevos: `arranque` (8). Evidencia del ensayo y la carga
  en el plan de la fase. **El despliegue físico queda para el día de instalación**
  (sin acceso al NAS todavía, F10-D1).
- **Fase 9 (hecha):** completada y aprobada por el usuario el 2026-08-24; CI verde.
  Pulido visual y de accesibilidad de punta a punta: tokens de elevación/movimiento y
  anillo de foco global, enlace "saltar al contenido", entradas escalonadas y skeletons
  por ruta (no spinners), contraste AA validado por función pura y corregido donde
  fallaba (texto blanco sobre el verde institucional → banda oscurecida al 80%), tablas
  del panel como región enfocable por teclado, y responsive a 390 px (nav del panel que
  envuelve, tablas anchas que se deslizan dentro de su marco). **Lighthouse a11y = 100**
  en las 5 vistas públicas; 182 tests en verde (5 rojos preexistentes del seed); lint y
  build limpios. Sin modo oscuro y sin Motion (decisiones F9-D1/D2).
- **Fase 8 (hecha):** Listado Maestro generado desde BD (una fila por documento por
  asociación principal, vigentes por defecto con filtro a "todos", export Excel con
  encabezado institucional + PDF por impresión), dashboard de estadísticas (KPIs, Top-N
  vistos/descargados, búsquedas sin resultados, mini-gráfico SVG por rango) y bitácora
  filtrable con `detalle` legible. El export de Excel queda auditado. Pusheado a
  `origin/main` (`73b17c1`).
- **Fase 7 (hecha):** editor del mapa 100% data-driven y tablas maestras desde el panel
  admin: motor genérico (`mover`/`alternarActivo`/`borrar` por nombre de tabla), CRUD de
  tipos de documento, textos institucionales, periféricos, macro/procesos/subprocesos;
  reordenar con ↑↓, desactivar con advertencia de huérfanos, borrar-solo-si-vacío, vista
  previa con inactivos. Todo auditado. Pusheado a `origin/main` (CI ARM64 verde).
- **Fase 6 (hecha):** auth propia (cookie httpOnly + tabla `sesiones` con token
  hasheado SHA-256 + Argon2id) y panel admin con el ciclo documental ISO completo
  (crear, subir archivos en streaming, publicar con obsolescencia automática en una
  transacción, anular, editar metadatos), todo auditado y con guard en dos capas
  (proxy optimista + `requerirSesion` real).
- **Hecho (Fase 5):** búsqueda con filtros facetados funcionando de punta a punta;
  verificada en navegador real (tipeo "vacunasion", acentos, GTH parcial, filtros
  combinados tipo+proceso+subproceso, registro en `busquedas`, límite de búsqueda
  visible en la petición 31+ y 429 en la descarga 61+) y `npm run build` limpio.
- **Hecho (Fase 4):** navegación en profundidad completa (mapa → proceso →
  subproceso → ficha → vista previa PDF → descarga), aprobada por el usuario el
  2026-07-16 tras el fix del visor (`2666a6d`).
- **Hecho (Fase 3):** el mapa de procesos interactivo es la página de inicio: 100%
  data-driven desde la BD, con las 4 bandas, entradas/salidas, PHVA, convenciones y
  lema; aprobado por el usuario el 2026-07-16 ("Aprobado, sigue con Fase 4").
- **Hecho (Fase 0):** planeación entregada y aprobada; mapa validado; stack cerrado.
- **Hecho (Fase 1):** repo `github.com/juanfyru/sgc-suaza` (privado); Next.js 16.2 +
  Tailwind 4 + shadcn/ui; Dockerfile ARM64 standalone; compose dev; CSP y cabeceras;
  CI verde (lint+build → imagen `linux/arm64` → GHCR + artefacto `.tar.gz` offline).
- **Hecho (Fase 2):** esquema Drizzle aprobado por el usuario e implementado
  (`src/db/esquema.ts`, 16 tablas); migraciones `drizzle/0000` (extensiones + config
  FTS `espanol_unaccent`) y `0001` (esquema); seed (`src/db/semilla.ts`): mapa completo
  validado (4 macros, 19 procesos, 56 subprocesos, 16 elementos periféricos, 9 tipos)
  + 28 documentos con 29 versiones, 36 archivos, 46 asociaciones M:N y 8 relaciones
  procedimiento↔formato; tests (`tests/esquema.test.ts`, 14 en verde) que verifican en
  la BD: una sola versión vigente, una sola asociación principal, un solo archivo
  principal por versión, CHECKs de estados/aprobación, FTS sin acentos, código parcial
  y tolerancia a tipos ("consulta esterna" → Consulta Externa).
- **Hecho (Fase 3):** capa de datos `src/db/consultas/mapa.ts` (conteos D10 en SQL);
  componentes `src/componentes/mapa/` (TarjetaProceso, Banda, Conector, RailPeriferico,
  Phva, MapaProcesos escritorio, AcordeonMapa móvil con details/summary nativos);
  registro de íconos data-driven con fallback (`src/componentes/iconos.tsx`); tokens
  institucionales en `globals.css` (azul #1B4E8E, verde #2E9B47, lienzo #F6F8FB);
  tipografía display Archivo + Geist; placeholder `procesos/[slug]` con breadcrumb.
- **Hecho (Fase 4):** almacén físico generado por el seed (`src/db/placeholders.ts`:
  PDF a mano + DOCX/XLSX con jszip; hash SHA-256 y tamaño en BD son los del archivo
  real; `./almacen` gitignored, ruta por `ALMACEN_RUTA`); servido seguro de archivos
  (`src/lib/almacen.ts` anti path-traversal con tests;
  `/documentos/[codigo]/archivos/[id]` valida pertenencia a la versión VIGENTE,
  MIME de BD, Content-Disposition RFC 5987, `Cache-Control: no-store`, streaming);
  consultas (`src/db/consultas/procesos.ts`, `documentos.ts`, `eventos.ts`); vista de
  proceso completa (subprocesos con conteo, toggle server-driven, "También aplica
  aquí" con procedencia); vista de subproceso agrupada por tipo; ficha de documento
  (metadatos ISO, vista previa PDF `<object>`, descargas por rol, chips "Dónde
  aplica" con propietario destacado, relacionados bidireccionales); componentes
  compartidos (IconoFormato por MIME, Migas, MiniMapa, NavHermanos, GruposPorTipo,
  TarjetaDocumento); eventos_consulta con IP + user-agent (D8); `vitest.config.ts`
  con alias `@/`; dependencias nuevas: `file-type` (runtime), `jszip` (dev).
- **Hecho (Fase 5):** consulta `src/db/consultas/busqueda.ts` (`buscarDocumentos`:
  FTS + ILIKE de código + `word_similarity`, facetas de tipo/proceso que no se
  autofiltran, resaltado con `ts_headline`, solo vigentes; `registrarBusqueda`);
  rate limiting en memoria `src/lib/limite.ts` (`crearLimitador`, reloj inyectable);
  página `/buscar` (Server Component con searchParams: filtros server-driven por
  links, fechas por form GET, vacíos con sugerencias, aviso de límite); componentes
  `src/componentes/busqueda/` (CampoBusqueda client con debounce 350 ms +
  router.replace, TarjetaResultado, TextoResaltado) y `EncabezadoSitio` global en el
  layout (marca + form GET a /buscar en todas las páginas); 429 con Retry-After en
  el route handler de archivos; tests `busqueda-fase5` (15) y `limite` (4).
- **Hecho (Fase 6):** hash de claves con Argon2id (`src/lib/clave.ts`, smoke ARM64 en
  el Dockerfile); ciclo de sesión en BD con token cuyo SHA-256 es la PK de `sesiones`,
  renovación deslizante 12 h y limpieza oportunista (`src/lib/sesion.ts`,
  `sesion-constantes.ts`); bootstrap idempotente del admin por env vars
  (`asegurarAdmin` en `src/db/consultas/admin.ts`, script `scripts/asegurar-admin.ts`,
  `npm run admin:asegurar [-- --forzar-clave]`); guard en dos capas (`src/proxy.ts`
  optimista + `src/lib/sesion-actual.ts` `requerirSesion`); consultas de escritura y
  lectura del panel (crear documento/versión, editar metadatos/versión, publicar,
  anular, listados, detalle — todas en `admin.ts`) con auditoría transaccional;
  validación de subida por allowlist + magic bytes con nombres saneados
  (`src/lib/subida.ts`); handlers de archivos del admin (POST subida por cuerpo crudo
  en streaming, GET vista previa de cualquier estado, DELETE de borrador) y
  `src/lib/servir-archivo.ts` extraído del route público sin cambiar su comportamiento;
  Server Actions del ciclo (`src/app/admin/acciones.ts`) con login rate-limitado y
  errores de negocio que conservan lo escrito; UI del panel (login, tabla con badges,
  formulario de documento con asociaciones al mapa, detalle con carga drag & drop +
  progreso XHR, publicar/anular con confirmación por `<details>`, banda diagonal
  OBSOLETO/ANULADO); tests nuevos: `clave` (3), `sesion`+`asegurarAdmin` (7),
  `guardia` (14), `publicar` (11), `subida` (10). Dependencia nueva: `@node-rs/argon2`
  (prebuilds ARM64). `vitest.config.ts` excluye `.next/**` (el output standalone
  copiaba los tests y los corría duplicados).
- **Hecho (Fase 7):** motor genérico `src/db/consultas/mapa-admin.ts` (`mover`,
  `alternarActivo`, `borrar`, `siguienteOrden` parametrizados por nombre de tabla con
  `sql(tabla)`; `traducirUnico` para 23505; CRUD de tipos, periféricos, macro/procesos/
  subprocesos con `docsAfectados` para la advertencia de huérfanos; UPSERT de textos con
  `patron_codigo` validado); acciones `src/app/admin/acciones-mapa.ts` (genéricas de
  fila `mover/alternar/borrar` con `tabla` validada contra allowlist + create/edit por
  entidad, todas envueltas en `mutacion`); helpers puros extraídos a
  `src/app/admin/comun.ts`, validadores `src/lib/validaciones-mapa.ts` y
  `src/lib/slug.ts`; componentes UI compartidos `src/componentes/admin/mapa/`
  (BotonesOrden, BotonToggle, BotonBorrar, ConfirmarDesactivar, SelectorIcono,
  Formulario*/Lista* por entidad); páginas `src/app/admin/(panel)/mapa/**` y
  `/tipos/**`; `obtenerDatosMapaAdmin()` + flag `activo?` opcional en los tipos y
  componentes del mapa para la vista previa (el camino público intacto);
  `NOMBRES_ICONO` expuesto desde `iconos.tsx`; tests `mapa-admin` (15) y
  `validaciones-mapa` (7), `guardia` extendido con las nuevas rutas. Sin cambios de
  esquema (todas las columnas ya existían).
- **Hecho (Fase 8):** capa de datos `src/db/consultas/maestro.ts` (una fila por documento
  por asociación principal con `JOIN LATERAL` de la versión representativa; propietario
  desde proceso o subproceso), `estadisticas.ts` (KPIs, Top-10 vistos/descargados,
  búsquedas sin resultados agrupadas, serie por día; reloj `ahora` inyectable) y
  `bitacora.ts` (filtros acción/entidad/fecha/texto, paginación 50 con COUNT separado,
  código del documento resuelto por LATERAL para responder "¿por qué desapareció?");
  constructor puro `src/lib/maestro-excel.ts` (exceljs, encabezado institucional, autofiltro,
  saneo de inyección de fórmulas) servido por el route handler
  `src/app/admin/(panel)/maestro/excel/route.ts` (guard `requerirSesion` + auditoría
  `exporto_maestro`); `src/lib/bitacora-detalle.ts` (`describirEvento`, frase legible por
  acción con fallback seguro); componentes `src/componentes/admin/estadisticas/`
  (`geometria.ts` pura + `GraficoBarras.tsx` SVG accesible con tabla equivalente) y
  `src/componentes/admin/maestro/BotonImprimir.tsx`; páginas `/admin/maestro`,
  `/admin/estadisticas`, `/admin/bitacora` (Server Components, filtros server-driven,
  estilos `print:` para el PDF); tres entradas nuevas en el nav del panel. Tests:
  `maestro` (3), `maestro-excel` (3, incluye inyección de fórmulas), `estadisticas` (3),
  `geometria` (2), `bitacora-detalle` (6), `bitacora` (3), `guardia` +1. Dependencia
  nueva: `exceljs` (JS puro, ARM64 seguro). `vitest.config.ts` ahora con
  `fileParallelism: false` (los tests de BD comparten la BD dev; en paralelo los fixtures
  de uno ensuciaban las aserciones de conteo de otro).
- **Hecho (Fase 9):** en `globals.css`, tokens `--dur-rapida/-media`, `--ease-salida`,
  `--sombra-1/2/3`, anillo `:focus-visible` global de especificidad 0 (`:where`),
  utilidad `.entrada` (generaliza `.banda-animada` con `--indice`), `.skeleton` (shimmer
  apagado por el bloque global `prefers-reduced-motion`) y `.saltar-al-contenido`;
  `layout.tsx` con el skip-link + `<div id="contenido">` (bloque `flex-1 min-w-0` para
  que las tablas anchas se desplacen dentro de su región, no del body); primitiva
  `src/componentes/Skeleton.tsx` + `loading.tsx` en las 8 rutas premium; entrada
  escalonada + elevación por token en `TarjetaResultado` (prop `indice`) y en las
  tarjetas KPI del dashboard; `src/lib/contraste.ts` (`contrasteWCAG`/`luminanciaRelativa`
  puras) con test que fija los pares reales de la UI ≥ 4.5:1; fix de contraste del verde
  (banda `color-mix(... 80%, black)` para texto blanco, opacidades removidas en
  `IconoFormato`, ficha y `VisorPdf`); tablas de Maestro/Bitácora como `role="region"`
  `tabIndex={0}` con `aria-label` y foco visible + objetivos táctiles `py-2`; campo de
  búsqueda del `EncabezadoSitio` a `focus-visible`; nav del panel con `flex-wrap`.
  Tests nuevos: `a11y-estructura` (11: skip-link, 8 skeletons, 2 regiones) y `contraste`
  (10). Sin dependencias nuevas. `npm audit`: 11 moderadas transitivas de tooling, sin
  fix seguro (ver Deuda técnica). Verificación con Lighthouse + Playwright (teclado,
  contraste axe-lite, móvil 390 px).
- **Post-Fase 9 (2026-08-24):** marca de agua **"COPIA NO CONTROLADA"** + fecha de
  descarga, estampada al vuelo en cada página de **todo PDF que sale por la ruta
  pública** (descarga adjunta Y vista previa inline — el visor del navegador permite
  descargar/imprimir, así que la vista limpia era un hueco y el usuario pidió
  cerrarlo): `src/lib/marca-agua.ts` (pdf-lib, fecha inyectable),
  `respuestaArchivoEstampado(archivo, esDescarga)` en `servir-archivo.ts` y cableado
  en el route público. Panel admin y formatos no-PDF siguen sirviendo el original.
  Tests: `marca-agua` (8) y `descarga-estampada` (2, contra BD dev). Ver D58.
- **Sigue:** el **día de instalación** en el QNAP real (ejecutar `INSTALACION.md`),
  cuando el usuario tenga acceso. No quedan fases de desarrollo en `PLAN.md`.

## Decisiones tomadas y su porqué

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D1 | Layout del mapa por **bandas fijas** (estratégicos/misionales/apoyo/evaluación + periféricos); contenido y orden configurables en BD, tarjetas fluyen automáticamente | Las 4 bandas son estructuralmente estables en ISO 9001. Un editor de posiciones libres sería sobreingeniería y permitiría al admin romper el diagrama. El campo `banda` en el macroproceso deja barato migrar a bandas dinámicas si algún día hace falta | 2026-07-15 |
| D2 | **Drizzle** en vez de Prisma | Sin engine binario (elimina el riesgo ARM64), menor consumo de RAM, SQL-first facilita las queries de FTS (`tsvector`, `pg_trgm`) | 2026-07-15 |
| D3 | Auth propia (cookie httpOnly + tabla sesiones + Argon2id) en vez de Auth.js/Lucia | Un solo usuario admin, sin OAuth posible (no hay internet). Lucia está deprecado. Auth.js agrega complejidad sin beneficio para este caso | 2026-07-15 |
| D4 | Despliegue **offline**: CI publica imagen a GHCR **y** como `.tar` (`docker save`) → SMB → `docker load` en el NAS | El NAS no tiene salida a internet; no puede hacer `docker pull` | 2026-07-15 |
| D5 | Una versión de documento puede tener **varios archivos** (rol: `principal` / `editable` / `anexo`) | Los formatos se publican en PDF (lectura) **y** editable (diligenciamiento) a la vez, según el usuario | 2026-07-15 |
| D6 | Asociación documento↔mapa **muchos-a-muchos** con exactamente una asociación `principal` | Realidad del hospital (formatos de acta/informe usados por varios procesos). La principal define propietario, valida el código y evita doble conteo en el Listado Maestro | 2026-07-15 |
| D7 | Export del Listado Maestro: Excel con `exceljs`; PDF vía hoja de estilos de impresión | Puppeteer/Chromium es inviable en 4 GB ARM | 2026-07-15 |
| D8 | Trazabilidad de consulta pública por **IP + user-agent** (sin login) | El usuario quiere saber desde dónde se consulta/descarga sin agregar fricción de login | 2026-07-15 |
| D9 | Mobile: el mapa colapsa a **acordeón por macroproceso** (no zoom/pan) | Zoom-out deja texto ilegible; pan pierde contexto. El acordeón conserva jerarquía, accesibilidad y velocidad | 2026-07-15 |
| D10 | Conteo en tarjetas del mapa: documentos **vigentes** que aplican al proceso (propios + secundarios), **incluyendo subprocesos** | Es la pregunta real del funcionario: "¿qué hay aquí para mí?". Se documenta en tooltip para que sea explícito | 2026-07-15 |

## Datos del entorno real (respuestas del usuario, 2026-07-15)

- NAS QNAP TS-832PX con **4 GB RAM** (ampliación futura posible, diseñar para 4).
- Solo LAN, **sin salida a internet desde el NAS**.
- Repo en cuenta personal de GitHub del usuario.
- Volumen inicial: **~200 documentos**; concurrencia máxima ~**20 usuarios**.
- Plazo: "lo más pronto posible" (sin fecha de auditoría fija).
- Formatos a cargar: PDF, Office, imágenes, comprimidos.
- **Una sola persona administra** (rol único).
- Identidad visual: derivar tokens de los colores de la imagen del mapa (azul
  institucional + verde). No hay manual de imagen formal entregado.

## Pendientes que dependen del usuario

- [ ] **Convención de códigos**: siglas de tipos de documento y de procesos, y alcance
  del consecutivo (formato confirmado: `TIPO-PROCESO-CONSECUTIVO`, ej. `PR-GTH-001`).
  Bloquea la validación fuerte del código en el admin (Fase 6); mientras tanto se valida
  solo el patrón general `^[A-Z]{2,4}-[A-Z]{2,4}-\d{3}$` de forma configurable.
- [ ] **Documentos reales**: aún no están aprobados ni numerados. Hasta entonces, seed
  con documentos ficticios verosímiles. No hay migración en lote comprometida.
- [ ] Logo institucional en mejor resolución/vectorial, si existe.

## Dudas menores resueltas/abiertas sobre el mapa

- Estructura completa validada por el usuario tal como está en `PLAN.md` §Apéndice.
- Abierta (no bloqueante): nombre completo de "PYM" y si "Sistema de Gestión de Calidad"
  y "Gestión del Riesgo" tienen subprocesos no visibles en la imagen. Confirmar cuando
  se carguen los documentos reales; el mapa es editable así que corregirlo es trivial.

## Decisiones adicionales (Fase 1)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D11 | Las reglas permanentes viven en `AGENTS.md`; `CLAUDE.md` es un puntero `@AGENTS.md` | create-next-app 16 instaló esa convención (compatible con más agentes); se conservó su advertencia sobre cambios de API de Next 16 | 2026-07-15 |
| D12 | Cliente de BD con inicialización perezosa (`obtenerSql()`), nunca en el ámbito del módulo | `next build` evalúa los módulos y no hay `DATABASE_URL` en build; falló el primer build de imagen por esto | 2026-07-15 |
| D13 | En desarrollo, Postgres se publica en `127.0.0.1:5434` | En la máquina de desarrollo, 5432 lo ocupa un Postgres nativo de Windows y 5433 el proyecto `doctime` | 2026-07-15 |
| D14 | shadcn/ui actual usa `@base-ui/react` (ya no Radix) y Next 16 renombró `middleware` a `proxy` | Anotado para no aplicar patrones viejos; consultar `node_modules/next/dist/docs/` ante dudas de API | 2026-07-15 |

## Decisiones adicionales (Fase 2)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D15 | Tabla `documento_relaciones` (procedimiento ↔ formatos que usa) | El usuario describió los formatos como "documento relacionado" de los procedimientos; derivarlo por subproceso compartido sería impreciso | 2026-07-15 |
| D16 | Número de versión entero (1, 2, 3…) | Aprobado por el usuario; permite ordenar y validar "la nueva versión es mayor" sin ambigüedad | 2026-07-15 |
| D17 | Config FTS propia `espanol_unaccent` (spanish + unaccent) usada en columna generada `tsv` con pesos A/B/C, + índices trigram en código y título | Búsqueda insensible a acentos con ranking; trigram cubre código parcial y errores de tipeo | 2026-07-15 |
| D18 | Siglas de proceso PROVISIONALES de 3 letras (GES, CAL, SOG, RIE, ATU, CEX, PYM, ADX, ATE, AIN, INT, GBS, GTH, GRF, GJU, GIC, GDO, SCI, AEV) | El usuario aún no entrega la convención oficial; son editables desde el admin sin migración | 2026-07-15 |
| D19 | Tests de reglas de negocio contra la BD dev sembrada (no mocks) | Lo que se verifica es que la BD misma rechace violaciones (índices parciales, CHECKs) — un mock no probaría nada | 2026-07-15 |

## Decisiones adicionales (Fase 3)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D20 | Colores de banda como CSS custom property `--color-banda` + derivados con `color-mix` (tintes 12%, texto 80% hacia negro) | El color vive en BD (hex editable); los derivados se calculan en CSS y mantienen contraste razonable para cualquier color que elija el admin | 2026-07-16 |
| D21 | Acordeón móvil con `<details>/<summary>` nativos, sin JavaScript | Accesible por defecto, funciona sin hidratación, cero peso JS | 2026-07-16 |
| D22 | Sin Framer Motion todavía: hover/entradas con CSS puro (`transition`, keyframes + `animation-delay`) | A esta escala CSS basta; Motion se evaluará en Fase 9 para transiciones de página. Menos JS en un portal de intranet | 2026-07-16 |
| D23 | Tipografía: Archivo (display) + Geist (UI), ambas empaquetadas por next/font en build | Sin CDN en runtime (NAS offline); Archivo da carácter institucional latinoamericano sin caer en la estética genérica | 2026-07-16 |
| D24 | CSP permite `unsafe-eval` SOLO en desarrollo | El overlay de errores de Next lo requiere; producción queda estricta | 2026-07-16 |
| D25 | Íconos de mapa por nombre (kebab-case lucide) resueltos contra un registro explícito con fallback | Data-driven sin `import *` (tree-shaking intacto); un nombre mal escrito en admin nunca rompe el render | 2026-07-16 |

## Decisiones adicionales (Fase 4)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D26 | El seed genera los archivos FÍSICOS del almacén (PDF escrito a mano; DOCX/XLSX con `jszip`, devDependency) y guarda hash/tamaño REALES | Metadatos y disco nunca divergen; `file-type` detecta el MIME correcto de cada placeholder (test). jszip no viaja en la imagen del NAS | 2026-07-16 |
| D27 | URL de archivos anidada bajo el código: `/documentos/[codigo]/archivos/[id]`; inline por defecto, `?descarga=1` como adjunto; `Cache-Control: no-store` | La query valida que el archivo pertenezca a la versión VIGENTE de ESE documento (regla 3); no-store evita servir desde caché algo que dejó de estar vigente | 2026-07-16 |
| D28 | El evento `vista` lo registra la ficha; `descarga` solo el handler con `?descarga=1` | El `<object>` de la vista previa dispara un fetch del PDF: registrarlo duplicaría cada vista | 2026-07-16 |
| D29 | Toggle "incluir subprocesos" ACTIVO por defecto (`?subprocesos=0` lo excluye), server-driven con links | El conteo D10 de la tarjeta del mapa incluye subprocesos: al entrar, el usuario ve el mismo número. Sin JS: funciona sin hidratación | 2026-07-16 |
| D30 | "También aplica aquí" muestra la procedencia ("Propio de: X") con estilo distinguible (borde punteado, fondo muted) | El funcionario sabe de inmediato que el documento pertenece a otro proceso y dónde vive el original | 2026-07-16 |
| D31 | Visor PDF (`VisorPdf`, client) con overlay de activación: inactivo por defecto (`pointer-events: none`) + "Clic para navegar el PDF" / "Liberar el scroll"; altura `clamp(20rem, 100dvh−16rem, 50rem)`; en <lg la información va antes que el visor | El plugin PDF consume la rueda del mouse y atrapaba el scroll de la página (bug reportado por el usuario tras probar la Fase 4). NO volver al `<object>` plano | 2026-07-16 |

## Decisiones adicionales (Fase 5)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D32 | Buscador híbrido: campo cliente que sincroniza `?q=` en la URL con debounce (350 ms, `router.replace`) + Server Component que lee searchParams y consulta; form GET real como fallback | Elegido por el usuario sobre la alternativa route handler + fetch: URLs compartibles, funciona sin JS, sin endpoint JSON público extra que auditar/ratelimitar | 2026-07-16 |
| D33 | Tres señales combinadas en `buscarDocumentos`: FTS `espanol_unaccent` + `ILIKE` sobre código (índice trigram) + `word_similarity ≥ 0.4` sobre título (solo términos de 4+ caracteres) | FTS solo no cubre "GTH" parcial ni "vacunasion" con tipeo; el umbral y el mínimo de caracteres evitan ruido en búsquedas cortas | 2026-07-16 |
| D34 | Resaltado con `ts_headline` y marcadores `⟦⟧` que React parte en `<mark>` (nunca innerHTML) | El contenido documental jamás se interpreta como HTML: sin XSS por títulos/descripciones | 2026-07-16 |
| D35 | Las facetas no se filtran a sí mismas (tipo se calcula sin el filtro de tipo; proceso sin el de proceso) y los links de facetas llevan `prefetch={false}` | Cambiar de tipo/proceso nunca es callejón sin salida; sin prefetch=false, el hover de un link registraría búsquedas fantasma en `busquedas` | 2026-07-16 |
| D36 | `crearLimitador` (ventana deslizante en Map, reloj inyectable): 30 búsquedas/min y 60 archivos/min por IP; el registro en `busquedas` solo ocurre cuando hay `q` | Instancia única en el NAS (sin Redis); el reloj como parámetro permite probar la ventana sin fake timers; el debounce ya evita registrar tecleos parciales | 2026-07-16 |

## Decisiones adicionales (Fase 6)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D37 | Sesión: token aleatorio de 32 bytes en cookie httpOnly; en BD vive solo su **SHA-256** como PK de `sesiones`. Vigencia 12 h con renovación deslizante (<6 h restantes → extiende) y limpieza oportunista de vencidas en cada validación | Si la BD se filtra, los hashes no sirven como tokens. La renovación evita expulsar al admin a mitad de trabajo; la tabla es diminuta (un usuario) así que el DELETE de limpieza es gratis | 2026-07-17 |
| D38 | Cookie de sesión con `maxAge` de **7 días** aunque la sesión en BD dura 12 h | La BD es la única fuente de verdad: un token vencido simplemente no valida. Una cookie más larga evita que el navegador la borre antes y deje al admin sin poder "salir" con auditoría | 2026-07-17 |
| D39 | Guard en **dos capas**: `proxy.ts` (Next 16, no middleware) solo mira si la cookie existe — nunca toca la BD; la validación real contra BD es `requerirSesion()` en el layout del panel y como primera línea de toda action/handler | El proxy corre en cada request y debe ser barato; la seguridad real (regla ISO 4: ninguna escritura sin sesión) se refuerza donde ocurre la mutación, no en el borde | 2026-07-17 |
| D40 | Bootstrap del admin por **variables de entorno** (`ADMIN_USUARIO`/`ADMIN_NOMBRE`/`ADMIN_CLAVE`) con script idempotente `asegurar-admin.ts` (`--forzar-clave` resetea) | Un solo admin, sin registro público. El script corre en el arranque del contenedor y es el camino de "olvidé la clave" en el NAS. **Retirar `ADMIN_CLAVE` del compose tras el primer arranque** (documentar en Fase 10 / INSTALACION.md) | 2026-07-17 |
| D41 | Subida por **cuerpo crudo en streaming** (archivo como body, nombre en header `x-nombre-archivo`, versión/rol en query) en vez de multipart | Streaming real a disco con hash y tope de 25 MB sin materializar el archivo en RAM (presupuesto de 768 MB) ni agregar un parser multipart. La validación (sesión, Origin, borrador, tamaño, magic bytes) es idéntica a la del spec | 2026-07-17 |
| D42 | Se añaden `GET` (vista previa admin de **cualquier** estado) y `DELETE` (archivo de borrador) en `/admin/api/archivos/[archivoId]`, además del POST | El admin necesita revisar borradores antes de publicar y quitar un archivo mal subido sin dejar el borrador atascado. La ruta pública sigue siendo la única para funcionarios y solo sirve vigentes | 2026-07-17 |
| D43 | MIME por **magic bytes** con allowlist extensión→MIMEs que acepta también `application/zip` para los OOXML (docx/xlsx/pptx) | `file-type` no siempre distingue el subtipo OOXML con la muestra inicial; el riesgo residual (un zip renombrado) es aceptable en una intranet con un único admin autenticado. Un ejecutable renombrado a `.pdf` sí se rechaza (probado) | 2026-07-17 |
| D44 | Los errores de negocio de las Server Actions devuelven los **valores enviados**; el formulario los repuebla como `defaultValue` | React 19 resetea los campos no controlados al completar una action; sin esto, un código inválido borraría todo lo que el admin escribió | 2026-07-17 |

## Decisiones adicionales (Fase 7)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D45 | Motor genérico por **nombre de tabla** (`mover`/`alternarActivo`/`borrar`) con `sql(tabla)` y ámbito de orden configurable (banda/macro/proceso/tipo/global) | Cinco entidades ordenables comparten la misma lógica; parametrizar evita duplicar swap/toggle/delete y sus tests. postgres.js escapa identificadores dinámicos de forma segura | 2026-07-18 |
| D46 | **Reordenar con botones ↑↓** (Server Action que intercambia `orden` con el vecino del mismo ámbito), no drag&drop | Accesible por teclado por defecto (regla no negociable), casi sin JS, encaja con el estilo server-driven; a 2–7 hijos por nodo el drag&drop aporta poco y agrega superficie de bugs | 2026-07-18 |
| D47 | **Desactivar por defecto; borrar solo si vacío** — el botón Borrar solo se renderiza si no hay dependientes; la FK `onDelete restrict` (traducida de 23503) es la red de seguridad | Retención ISO: nada con historia se elimina. La UI no ofrece borrar lo que tiene documentos/hijos; el intento igual falla en BD con mensaje legible | 2026-07-18 |
| D48 | **Cambios en vivo + vista previa con inactivos** (flag `activo?` opcional en los tipos del mapa; `obtenerDatosMapaAdmin` sin filtro), sin sistema de borrador/staging | Cumple "ver el cambio en el mapa público sin despliegue"; el staging del mapa entero sería sobreingeniería. El flag opcional deja el camino público sin cambios de conducta | 2026-07-18 |
| D49 | Al **desactivar un nodo con documentos vigentes** debajo, se permite pero se advierte con la lista de códigos que quedarán sin ruta en el mapa (siguen vigentes y buscables), no se bloquea | Evita callejones sin salida en reorganizaciones legítimas; el admin confirma con conocimiento de causa y queda en auditoría | 2026-07-18 |
| D50 | **Slug** auto-generado del nombre al crear, estable al renombrar, editable en "opciones avanzadas" con aviso de que rompe enlaces | Preserva URLs/marcadores por defecto; permite corregir un slug cuando hace falta sin migración | 2026-07-18 |

## Decisiones adicionales (Fase 8)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D51 (B2) | Listado Maestro **solo-vigentes por defecto** con filtro opcional a "todos"; el export respeta el filtro activo | La vista por defecto es la que exporta el auditor (documentos en circulación); el filtro da inventario completo cuando el admin lo necesita, sin dos reportes distintos | 2026-07-21 |
| D52 (B3) | Export **con encabezado institucional** (hospital, título, fecha/hora, alcance, total) en Excel y PDF | Presentable para auditoría; un maestro que revisa un auditor lleva ese bloque. El Excel es una función pura (fecha inyectada) → testeable | 2026-07-21 |
| D53 | Export **Excel por route handler** con su propio guard `requerirSesion` + auditoría `exporto_maestro`; **PDF por `window.print()`** con estilos `print:`, sin ruta servidor | Regla del NAS: nada de Puppeteer. El Excel pasa por el servidor (se audita); el PDF es cliente (no se audita en esta fase). Un solo camino de datos, dos presentaciones | 2026-07-21 |
| D54 | **Saneo de inyección de fórmulas** en el Excel: se antepone `'` a celdas de texto que empiecen por `=`,`+`,`-`,`@`,tab,CR | Títulos/códigos/responsables son texto libre del admin; sin esto una celda `=HYPERLINK(...)` se ejecutaría al abrir el archivo en el Excel del hospital (hallazgo de la revisión de seguridad automática) | 2026-07-21 |
| D55 (B4) | Dashboard **Top-N + mini-gráfico SVG puro** (sin librería de charts) con selector de rango y reloj inyectable | Frugal en el NAS (sin dependencia extra); la geometría es una función pura testeada; el gráfico lleva tabla equivalente `sr-only` (accesibilidad) | 2026-07-21 |
| D56 (B5) | Bitácora con **`detalle` renderizado legible** (`describirEvento`, función pura) y **código del documento resuelto por `LATERAL`** (por entidad o `detalle->>'documentoId'`) | Responde "¿por qué desapareció este formato?" en lenguaje claro y permite buscar por código; fallback seguro para acciones no mapeadas, nunca JSON crudo ni HTML | 2026-07-21 |
| D57 | `vitest.config.ts` con **`fileParallelism: false`** | Los tests de BD comparten la BD dev; en paralelo los fixtures de un archivo son visibles para los lectores concurrentes de otro y ensucian sus aserciones de conteo. Secuencial → cada `afterAll` limpia antes del siguiente archivo | 2026-07-21 |

## Decisiones adicionales (Fase 9)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| F9-D1 | **Sin modo oscuro.** Se deja el andamiaje `.dark` de shadcn intacto, sin toggle ni afinado a la marca | Intranet de trabajo diurno, un solo admin, funcionarios de consulta. Afinar y verificar el oscuro en cada vista rinde menos que invertir el esfuerzo en el modo claro (YAGNI) | 2026-07-21 |
| F9-D2 | **Animación 100% CSS puro**; no se introduce Motion pese a estar en el stack | Frugal para el NAS (4 GB, offline): cero JS extra en páginas públicas. A esta escala CSS/keyframes alcanza; consistente con D22 | 2026-07-21 |
| F9-D3 | **Pulido premium** en público + Maestro/Estadísticas/Bitácora; los CRUD internos solo reciben a11y/teclado/responsive | Mejor relación esfuerzo/valor: el pulido rinde donde lo ve un auditor o funcionario, no en formularios de un solo usuario | 2026-07-21 |
| F9-D4 | Verificación **manual/herramienta** (Lighthouse, teclado, celular real); solo se automatiza a11y estructural no frágil (skip-link, existencia de `loading.tsx`, regiones) | Inventar tests de píxeles sería frágil; el grueso del criterio se ejecuta y se observa | 2026-07-21 |
| F9-D5 | **Texto blanco sobre banda** usa la banda oscurecida `color-mix(in srgb, var(--color-banda) 80%, black)`, no el color crudo | El verde institucional `#2e9b47` daba 3.56:1 con blanco (falla AA); oscurecer al 80% garantiza ≥ 5:1 para **cualquier** color que elija el admin, sin hardcodear (hallazgo de Lighthouse) | 2026-07-21 |
| F9-D6 | El anillo de foco global usa `:where(...)` (especificidad 0) y `#contenido` es bloque `min-w-0` | Especificidad 0 deja que cualquier componente sobreescriba el foco; `min-w-0` permite que las tablas anchas se desplacen dentro de su región en vez de desbordar el body en móvil | 2026-07-21 |
| F9-D7 | **`export const dynamic = "force-dynamic"` en `(panel)/layout.tsx`** | Los `loading.tsx` (límites de Suspense) inducen a Next a generar el **shell estático** de las páginas admin de **ruta fija** (p. ej. `/admin/documentos/nuevo`) en build, ejecutando sus consultas a BD; el CI/NAS compila **sin `DATABASE_URL`** (D12) y fallaba al prerenderizar. `force-dynamic` en el layout marca todo el panel como por-petición: nunca se prerenderiza. Regla durable: **página autenticada que consulta BD + `loading.tsx` ⇒ debe ser dinámica.** Las páginas públicas con `loading.tsx` no sufren esto (la home y `/buscar` ya son `force-dynamic`; proceso/subproceso/ficha son de parámetro dinámico `ƒ`, no se prerenderizan) | 2026-07-21 |

## Decisiones adicionales (post-Fase 9)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| D58 | Marca de agua "COPIA NO CONTROLADA" en **toda salida pública de PDF** — descarga (`?descarga=1`, attachment) **y vista previa inline** (el ojo / `<object>` de la ficha); el admin sirve el original por su propia ruta y los no-PDF bajan tal cual. Estampado con **pdf-lib** (JS puro, ARM64/offline seguro, Helvetica embebida) página por página + leyenda "Descargada el DD/MM/AAAA — verifique su vigencia en el SGC". **Fail-open**: si el PDF no se puede estampar (cifrado/corrupto) se sirve el original con `console.error` — la marca es salvaguarda, nunca deja inaccesible un documento vigente. Sin streaming en ese camino (el estampado exige el buffer completo; el tope de subida de 25 MB lo acota) | ISO 7.5.3: la copia que sale del sistema deja de estar controlada; en el NAS no hay Puppeteer ni binarios nativos posibles. El alcance inicial era solo la descarga (elección del usuario), pero el visor del navegador permite descargar/imprimir desde la vista inline sin marca; el usuario pidió cerrar ese hueco el mismo día | 2026-08-24 |

## Decisiones adicionales (Fase 10)

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| F10-D1 | **Alcance sin NAS:** la fase cierra con el ensayo local completo + documentación; el criterio "RAM < 1.3 GB con 20 concurrentes" se midió localmente como cota (≈165 MiB) y queda como verificación vinculante del día de instalación | El usuario no tiene acceso al QNAP todavía | 2026-08-24 |
| F10-D2 | **Arranque por script precompilado:** esbuild bundlea `scripts/arrancar.ts` → `arrancar.js` en el build; CMD `node arrancar.js && exec node server.js` | Si la migración falla, el server NO arranca y la restart policy reintenta con el error evidente; `instrumentation.ts` no garantiza no servir tráfico antes de migrar | 2026-08-24 |
| F10-D3 | Migraciones con **`migrate()` de drizzle-orm** (conexión propia `max: 1`) leyendo `drizzle/` copiada a la imagen | `drizzle-kit` es devDependency pesada; `migrate()` es el mecanismo de producción de Drizzle | 2026-08-24 |
| F10-D4 | **`ADMIN_FORZAR_CLAVE=1`** en el arranque como camino de "olvidé la clave" | `asegurar-admin.ts` es tsx y no existe en la imagen; un env var + recrear contenedor lo ejecuta sistemas sin herramientas | 2026-08-24 |
| F10-D5 | **`mem_limit`/`memswap_limit`** en el compose del NAS (no `deploy.resources` como en dev) | Lo respeta cualquier Container Station sin swarm; verificado por inspect (805306368 / 536870912) | 2026-08-24 |
| F10-D6 | Respaldo por **crontab de QTS** + `docker exec pg_dump -Fc`, verificación `pg_restore --list`, retención 30 días | Prohibido un tercer contenedor; QTS trae cron persistente (`/etc/config/crontab`) | 2026-08-24 |
| F10-D7 | Tar del CI con **doble tag** `latest` + `AAAAMMDD-sha7` y artefacto nombrado con el tag | Rollback offline: conservar el tar anterior y cambiar `SGC_VERSION` en `.env` | 2026-08-24 |
| F10-D8 | La prueba de carga usa **presupuestos globales por minuto** (50 archivos, 25 búsquedas) bajo los rate limits | Toda la carga sale de UNA IP: sin presupuestos se mediría el 429, no la app | 2026-08-24 |

## Decisiones de la sesión de diseño de SGC Integral (2026-11-03)

El detalle y el porqué de cada una están en el spec maestro
(`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md`, §10 para las de
Claude). Aquí solo el índice:

| # | Decisión | Quién |
|---|---|---|
| SI-1 | La app deja el NAS: servidor por entidad (Suaza: Windows en el hospital), posible exposición a internet; se diseña como si estuviera expuesta | Usuario / Claude |
| SI-2 | Todo requiere sesión; el portal abierto desaparece. Reglas de negocio 3 y 4 reformuladas como visibilidad por rol (spec §5.3) | Usuario |
| SI-3 | 40+ usuarios creados a mano; cinco roles fijos en código + asignación de procesos; matriz en `permisos.ts` con tests por celda | Usuario / Claude |
| SI-4 | Jerarquía organizacional: áreas, cargos con cargo superior, usuario con un cargo y jefe inmediato opcional | Usuario |
| SI-5 | Un solo motor de acciones de mejora con campo origen, compartido por los tres módulos | Usuario |
| SI-6 | Orden de fases 11–20 (`PLAN.md`) | Usuario |
| SI-7 | Instalación independiente por entidad, sin multi-tenancy; marca configurable; semilla mínima separada de la demo | Usuario / Claude |
| SI-8 | Contenedores sin atar el sistema operativo: compose con Caddy + app + PostgreSQL; `amd64` siempre, `arm64` bajo demanda; en Windows, Docker Engine en WSL2 | Usuario / Claude |
| SI-9 | Dirección visual C (clara, color de módulo y estado con significado) con tema oscuro opcional; tres capas de color: marca, módulo, estado | Usuario / Claude |
| SI-10 | Seguridad: mapa de los 20 riesgos del usuario (spec §5.9); zod, TOTP opcional exigible por rol, bloqueo por cuenta, roles de BD de mínimo privilegio, bitácora inmutable | Usuario / Claude |
| SI-11 | Planificador dentro de la app; respaldo diario cifrado ejecutado por la app; exportación completa | Claude |
| SI-12 | Documentación final obligatoria: manual de usuario (por capítulos al cierre de cada fase), manual técnico y procedimiento de respaldo y restauración (Fase 20) | Usuario |
| SI-13 | Carga histórica: los documentos ya aprobados en papel entran por publicación directa del Admin SGC, marcados "aprobación registrada fuera de la plataforma", sin acta; la versión siguiente recorre el flujo (spec §6.1, DC26) | Claude |
| SI-14 | Cuenta personal para todo funcionario que consulte, con alta por lote; `sgc-suaza` no se instala en Suaza sino en otro hospital, y las migraciones de Integral se mantienen aplicables sobre su base (spec DC29, DC31, DC32) | Usuario / Claude |

## Deuda técnica conocida

- `npm audit`: revisado en Fase 9. Las 11 moderadas son **transitivas de tooling de
  build/dev** (esbuild vía `@esbuild-kit`→`drizzle-kit`; postcss vía `next`; uuid vía
  `exceljs`) y **ninguna llega al runtime del NAS**. `npm audit fix` sin `--force` no
  aplica ningún cambio; los únicos "fixes" exigen `--force` con downgrades rotos
  (`drizzle-kit@0.18.1`, `next@9.3.3`, `exceljs@3.4.0`). Se **aceptan** hasta que los
  paquetes upstream publiquen versiones parcheadas; revisar al subir de major de Next.
  (`npm audit fix` subió de patch `shadcn` 4.13.0→4.13.1, CLI de dev, inofensivo.)
- El artefacto `.tar.gz` del CI aún no se ha probado con `docker load` en un NAS real
  (se hará en Fase 10; el formato `type=docker` es el estándar que Container Station
  acepta).
- Los tests de BD (esquema, archivos-vigentes, consultas-fase4, **sesion, publicar**)
  requieren la BD dev migrada y sembrada; no corren en CI todavía (agregar un job con
  Postgres de servicio cuando el esquema se estabilice). Los de almacén, placeholders,
  clave, subida, limite y guardia sí son autónomos.
- Retirar `ADMIN_CLAVE` del compose del NAS tras el primer arranque (queda en el
  entorno del contenedor); documentarlo en el INSTALACION.md de la Fase 10.
- El route handler de archivos lee el archivo completo vía stream pero sin soporte de
  `Range`; irrelevante a esta escala, revisar solo si los PDF reales resultan enormes.
