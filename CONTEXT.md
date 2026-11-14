# CONTEXT.md — Estado vivo del proyecto

> Se actualiza al cierre de cada fase. Última actualización: **2026-11-13**, al cerrar la **entrega complementaria de la 14A:
> rangos, códigos e importación** (rama `f14a-rangos-importacion`, sobre `main` con la 14A ya fusionada; sin publicar ni fusionar;
> ver su sección, arriba de «Qué probar y cómo (Fase 14A)»). Antes, al cerrar la 14A en su rama: la **Fase 14A —
> Indicadores, el indicador de punta a punta** está terminada en la rama `fase-14a-indicadores` (90 confirmaciones sobre
> `bced185`, sin publicar ni fusionar), con el recorrido del controlador hecho y sus defectos corregidos y la ola final de
> la revisión de toda la rama aplicada, y espera el recorrido del usuario; después viene la **Fase 14B** (datos compartidos,
> automáticos y avanzados), que cierra la Fase 14 del diseño maestro. La **Fase 13C — Vigencia, externos y normograma**
> está fusionada en `main` (`8acc9cf`, PR #3, 2026-11-10, 64 confirmaciones sobre `4bbb428`; la rama
> `fase-13c-vigencia-externos-normograma` sigue publicada, lista para borrarse), con el CI en verde; su recorrido del
> usuario sigue pendiente. La **Fase 13B — Distribución y puntos de uso** está fusionada en `main` (`2e321b6`, PR #2,
> 2026-11-08) y la **Fase 13A — Flujo documental**, con sus adiciones, también (`d0c6a42`, 2026-11-07), con el CI en
> verde. La Fase 12 (nueva estructura visual) y la Fase 11 (fundación de acceso) también están en `main`. La variante
> nació el 2026-11-03, bifurcada de `sgc-suaza` en `9644ceb`; el diseño maestro de las fases 11–20
> (`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md`) está aprobado y `AGENTS.md` describe el piso de
> despliegue nuevo.

## ⏸ Punto de reanudación (próxima sesión)

0. **Qué es este proyecto:** SGC Integral es la variante ampliada de SGC Documental
   (`sgc-suaza`). El usuario decidió el 2026-11-03 dejar la app original tal como está,
   con sus funcionalidades, y construir aquí otra con **funcionalidades más completas**.
   La original vive en `F:\sgc` (repo `juanfyru/sgc-suaza`) y **no se toca desde este
   proyecto**.
1. **Dónde quedamos:** la **Fase 14A — Indicadores, el indicador de punta a punta** está terminada en la rama
   `fase-14a-indicadores` (90 confirmaciones sobre `bced185`; spec
   `docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md`, aprobado el 2026-11-10 y común a la 14A y la 14B;
   plan `docs/superpowers/plans/2026-11-10-fase14a-indicadores.md`). **No está publicada ni fusionada:** espera el
   recorrido del usuario («Qué probar y cómo (Fase 14A)») y su decisión. Con ella el hospital ya puede llevar sus
   indicadores como los del Excel: ficha técnica versionada con formas de fórmula y fórmula libre (intérprete propio con
   fracciones exactas), semáforo escrito en palabras, aprobación con firma «Elaboró» y «Aprobó» (también en bloque),
   cambios mayores con «rige desde» y menores sin aprobador, duplicar, retirar, descartar, nivel de acceso y norma que lo
   exige; medición por periodo con resultado, color y frase al instante, «no aplica», soportes (PDF, imagen o `.xlsx`),
   análisis según el color (causa y acción propuesta en crítico, con la marca «Requiere acción de mejora»),
   observaciones, históricos y metas por periodo; cierre del mes y reapertura justificada; tareas, recordatorios,
   alertas por color y escalamiento al jefe sin nombre del indicador; lista, página del indicador con gráficas de tubos,
   matriz del año, ficha impresa y dos Excel; indicadores en la página del proceso, en la búsqueda y en el normograma.
   **Sin dependencias npm nuevas.** Doce migraciones en total (0000 a 0011). Detalle en «Hecho (Fase 14A)»; el
   recorrido, en «Qué probar y cómo (Fase 14A)»; las decisiones, en «Decisiones adicionales (Fase 14A)»; el manual, en
   el capítulo 8. **El controlador comprobó** la imagen `sgc-integral:f14a` en un contenedor aparte («Migraciones al
   día» y `/api/salud` `{"estado":"ok"}`), la `0011` sobre una copia de la base del usuario (de 11 a 12 migraciones; los
   maestros y los parámetros sembrados, ningún indicador, los usuarios intactos; la copia se borró) y el recorrido de §24
   en el navegador: de 18 pasos, 16 bien, el 8 con un texto del recorrido que no era así y el 7 fallido por el soporte
   `.xlsx` (D-1). La ronda 1 corrigió sus trece defectos (D-1 a D-13), añadió el mensaje «Se devolvió la ficha …» y
   ajustó este recorrido (ver «Hecho (Fase 14A)»). Después, el controlador subió un `.xlsx` real con el arreglo de D-1,
   en `next dev` y en la imagen reconstruida: entra («Listo», «Excel, 6 KB») y un `.xls` se rechaza. La revisión final de
   toda la rama pidió una ola de corrección (un crítico, dos importantes y nueve menores; F14A-R51 a R53), ya aplicada,
   y su re-revisión dos residuos (el soporte obligatorio hacia adelante y la gráfica alineada a una columna), también.
   **Verificado al cierre de los residuos:** con la demo recién sembrada en la base aparte `sgc_f14a`,
   `SEMILLA_RECIEN=1 npm test` dio 235 archivos, 5696 pruebas en verde y 1 saltada; lint limpio; `npm run build` sin
   URL de base en verde.
   **La base `sgc` del usuario no se tocó** (ver «Avisos para el usuario (Fase 14A)»).
   **Antes, la Fase 13C:** está en `main` (`8acc9cf`, PR #3 fusionado el 2026-11-10 por decisión del
   usuario, 64 confirmaciones sobre `4bbb428`; spec `b702403`, plan `faaae79`; la rama
   `fase-13c-vigencia-externos-normograma` sigue publicada, lista para borrarse). Los pasos 11 y 13 del procedimiento de control de documentos y la evidencia de PC-11 y PC-13 quedan dentro
   del sistema, y con ellos se cierra la Fase 13: plazo de revisión por tipo y por documento, contado desde la publicación
   o, en lo cargado como ya aprobado, desde la fecha de aprobación; semáforo de vigencia en la ficha, las listas, el
   Maestro, la página del proceso y **Vigencia → Semáforo**; ratificación con firma «Ratificó» y fecha fijada a mano (también
   en masa) para la carga inicial; documentos externos con su matriz (SGC-MZ-03), adopción firmada por edición,
   verificación de vigencia por un responsable técnico y retiro; revisión anual con decisión por documento y por proceso,
   prórroga, cierre firmado e informe congelado en PDF sobre un formato propio; normograma institucional y por proceso, con
   relaciones entre normas e impactos sobre documentos y procesos; siete indicadores del proceso documental con metas; y lo
   heredado de la 13B (Excel de socializaciones, fecha de corrección ajustable, catálogos en solo lectura, miembro «todos
   los usuarios activos», hallazgos en dos pasos, el aviso de **Reemplazar** y los conteos de copias del líder). **Sin
   dependencias npm nuevas.** Once migraciones en total (0000 a 0010). Detalle en «Hecho (Fase 13C)»; el recorrido, en «Qué
   probar y cómo (Fase 13C)»; las decisiones, en «Decisiones adicionales (Fase 13C)»; el manual, en el capítulo 7.
   **Verificado al cierre:** tras la corrección final, `SEMILLA_RECIEN=1 npm test` sobre la demo recién sembrada en una
   base aparte dio 197 archivos, 4722 pruebas en verde y 1 saltada; lint limpio; `npm run build` sin URL de base en
   verde; la imagen del compose de desarrollo arranca con «Migraciones al día» y responde `/api/salud`. **La base de desarrollo no se resembró** (F13C-R20) y un `next dev` arrancado antes de la 13C sirve una matriz
   de permisos vieja: ver «Avisos para el usuario (Fase 13C)». El usuario decidió fusionar el 2026-11-10; **su recorrido («Qué probar y cómo (Fase 13C)») sigue pendiente**, ahora
   sobre `main`.
   **Antes, la Fase 13B:** está en `main` (`2e321b6`, PR #2 fusionado el 2026-11-08 por decisión del
   usuario tras su recorrido manual, 42 commits sobre `f08f01d`; la rama `fase-13b-distribucion-puntos-de-uso` ya se
   borró). Lo que el papel y las personas hacen después de publicar queda dentro del sistema: puntos de uso con
   responsable; copias controladas numeradas con sello (franja y QR a la ficha) y su recibido, reimpresión con
   motivo, anulación, recogida automática cuando la versión deja de ser vigente y reemplazo en un acto; listas
   de distribución y audiencia de cada documento; acuses de lectura con «qué cambió», porcentaje y Excel;
   jornadas de socialización con evidencia, cuya asistencia vale como acuse; verificaciones en los puntos de
   uso con lista armada por el sistema, hallazgos y porcentaje de conformidad; todo en «Mis tareas», la campana
   y la revisión de vencimientos. **Sin dependencias npm nuevas.** Detalle en «Hecho (Fase 13B)»; el recorrido,
   en «Qué probar y cómo (Fase 13B)»; el manual, en el capítulo 6. **Verificado al cierre:** lint limpio;
   **3593/3593 tests** (155 archivos, `SEMILLA_RECIEN=1`, sin saltos, tras la ola final y con la demo recién
   sembrada); **tras los ajustes de la revisión del usuario del 2026-11-08** (filtro de Gestión de documentos y
   `DEV_ORIGENES`): lint limpio, **3588 tests en verde y 16 saltados** (156 archivos, demo ya avanzada por el
   recorrido manual, sin `SEMILLA_RECIEN`) y build en verde; build de producción sin URL de base; compose
   reconstruido con «Migraciones al día» (ocho migraciones) y `/api/salud` en verde; la 0006 y la 0007
   aplicadas sobre una copia de la demo de `main`; el recorrido de §18 en navegador (claro, oscuro y 390 px) hecho
   por el controlador, con la ola final de correcciones de la revisión de la rama (F13B-R18 a R22) y la demo
   resembrada al final. El usuario hizo su recorrido el 2026-11-08, pidió el filtro de Gestión de documentos y
   `DEV_ORIGENES`, y decidió fusionar.
   **Antes, la Fase 13A:** estaba en `main` (`d0c6a42`, publicada el 2026-11-07, 93 commits
   sobre `b94032e`; la rama `fase-13a-flujo-documental` ya se borró). Un documento nuevo, un cambio o una eliminación recorren ahora un trámite
   dentro del sistema: solicitud con visto bueno, aceptación con duplicidad asistida, código
   correlativo y plantilla, elaboración, revisión con lista de verificación y observaciones,
   aprobación por autoridad, publicación y acta en PDF, con firma por clave en cuatro momentos.
   Además: visibilidad por rol, nivel de acceso y participación; tareas, avisos y vencimientos;
   carga de lo ya aprobado; marca de agua con el nombre de quien descarga. **Sin dependencias npm
   nuevas.** Detalle en «Hecho (Fase 13A)». **Verificado al cierre:** lint limpio; **2824/2824 tests** (121 archivos,
   con `SEMILLA_RECIEN=1`; línea base de la fase: 1662 en 85); build de producción sin URL de base,
   como el CI; compose de desarrollo reconstruido (`up -d --build --no-deps app`, sin tocar `bd`):
   «Migraciones al día» con las seis migraciones, `/api/salud` 200 `{"estado":"ok"}`, `/` → 307 a
   `/ingreso`. La 0004 y la 0005 se aplicaron además sobre una copia con el esquema y la demo de
   `main`. Hubo tres puntos de control en navegador y una revisión final de toda la rama, con su ola
   de arreglos. El CI de `main` pasó sobre `d0c6a42`: lint y build; la imagen `arm64` es manual.
   **Adición del 2026-11-06 (acta con formato del hospital y criterios que no cumplen), también en
   `main`:** el acta se imprime sobre un PDF institucional que el Administrador del SGC elige
   en **Configuración documental**; un criterio no crítico en «No cumple» ya no pasa en silencio
   (nota obligatoria, confirmación de quien revisa y de quien aprueba, constancia en el acta); y el
   acta la ve quien ve el trámite cerrado, sin abrir el archivo de una versión obsoleta. Spec:
   `docs/superpowers/specs/2026-11-06-fase13a-acta-con-formato-y-criterios-design.md`. **Verificado
   al cierre de la adición:** lint limpio; **2971/2971 tests** (124 archivos, con `SEMILLA_RECIEN=1`);
   build sin URL de base, como el CI; compose reconstruido (`/api/salud` `{"estado":"ok"}`);
   recorrido en navegador sobre una copia con el formato real del hospital (claro, oscuro y 390 px).
   **Pendiente del usuario, sin bloquear la 13B:** poner el código y la fecha de emisión en su Word
   del formato del acta, guardarlo como PDF, registrarlo y elegirlo en **Configuración documental**
   con 5,5 y 3,5 cm; recorrer los pasos 14 a 16 de «Qué probar y cómo (Fase 13A)»; y decidir
   F13A-R35 (404 real en páginas). F13A-R36 ya está resuelta (F13A-AU6). Los archivos reales del
   hospital están en la raíz, sin seguimiento y excluidos en `.git/info/exclude`: nunca entran a un
   commit.
2. **Lo que sigue:** (a) el recorrido del usuario sobre la rama de la 14A («Qué probar y cómo (Fase 14A)», que empieza
   por resembrar) y su decisión de publicarla y fusionarla; (b) el recorrido de la 13C sobre `main`, aún pendiente
   («Qué probar y cómo (Fase 13C)»); (c) la **Fase 14B — Datos compartidos, automáticos y avanzados** (spec de la Fase
   14, §5.1 y §14 a §18): variables compartidas, fuente automática (los siete cálculos documentales de la 13C, «Reportes
   a tiempo» y «Objetivos cumplidos») con su enlace a Vigencia, la página «Objetivos», las constancias de envío al ente
   y los impactos por cambio de norma sobre indicadores, la desagregación y los compuestos. Su plan empieza por revisar
   §14 a §18 del spec contra el código, y la `0012` puede rehacer las tablas de la 14B que la `0011` dejó vacías (spec
   §19.5). La Fase 14 del diseño maestro se cierra cuando se fusione la 14B. Enganches que deja la 14A: la marca
   «Requiere acción de mejora» con su causa y su acción propuesta, que la Fase 15 convierte en acción formal; los
   objetivos como maestro; las tareas y avisos de indicadores, que la Fase 16 lleva al correo; los resultados por periodo,
   la matriz y el Excel, para el tablero y los reportes de la Fase 17. Insumos que dependen del usuario: las fichas reales
   de sus indicadores (el Excel `INDICADORES_PROCESO_SGC_OK.xlsx` trae las ocho del SGC), la regla del cambio mayor a una
   periodicidad más gruesa (F14A-R15) y, de antes, spec maestro §11 (SMTP, versión de Windows del servidor, planta de
   cargos real, plantilla del plan de mejoramiento, total de cuentas), la lista de verificación real (SGC-FO-03), el
   formato del informe de la revisión anual y el ajuste del texto de su procedimiento (manual, capítulo 7, sección 7).
3. **Entorno de desarrollo** (convive con `sgc-suaza` en la misma máquina):

   | Pieza | SGC Integral (esta) | sgc-suaza (original) |
   |---|---|---|
   | Carpeta | `F:\sgc-integral` | `F:\sgc` |
   | Postgres dev | `sgc-integral-bd-1`, `127.0.0.1:5435` | `sgc-bd-1`, `127.0.0.1:5434` |
   | `npm run dev` | `http://localhost:3002` (fijo en el script) | 3000 |
   | App en Docker (compose dev) | 9081 | 9080 |

   En esta máquina 5432 lo ocupa un Postgres nativo, 5433 y 3001 el proyecto doctime.
   Node 24 en todo; no bajar a 22. Variables de `.env.local` (plantilla:
   `.env.example`):

   | Variable | Valor en desarrollo | Para qué |
   |---|---|---|
   | `DATABASE_URL` | `postgres://sgc_app:sgc_app_dev@localhost:5435/sgc` | Conexión de la app **y de los tests** (rol `sgc_app`) |
   | `DATABASE_URL_MIGRADOR` | `postgres://sgc:sgc_dev@localhost:5435/sgc` | Dueño del esquema: migraciones, semillas, `db:roles`. Si falta, modo heredado (todo con `DATABASE_URL`, con aviso) |
   | `BD_APP_CLAVE` | `sgc_app_dev` | Clave del rol `sgc_app`; se sincroniza en cada `db:roles` y arranque. La misma en el compose de desarrollo |
   | `APP_SECRETO` | El de `.env.example` (solo desarrollo) | 32 bytes en base64; cifra los secretos TOTP (AES-256-GCM). Obligatoria en producción: sin ella el arranque falla |
   | `ZONA_HORARIA` | `America/Bogota` | Zona IANA de la instalación: TimeZone de la sesión de BD y formato de fechas (`zonaHoraria()`). Inválida = el arranque falla |
   | `CONFIAR_PROXY` | vacío | `1` detrás de Caddy (Fase 20): la IP sale de `X-Forwarded-For`/`X-Real-IP` |
   | `SESION_INACTIVIDAD_MIN` | `60` | Cierre de sesión por inactividad |
   | `EXIGIR_2FA_ROLES` | vacío | Roles con TOTP obligatorio, p. ej. `admin_sgc,gerencia` |
   | `ADMIN_USUARIO`, `ADMIN_NOMBRE`, `ADMIN_CLAVE` | `admin`, …, `cambiar-esta-clave` | Primer Admin SGC (`admin:asegurar` o el arranque del contenedor) |
   | `ADMIN_FORZAR_CLAVE` | — | `1` en el contenedor: rescate del admin (en desarrollo, `npm run admin:asegurar -- --forzar-clave`). Pone la clave de `ADMIN_CLAVE` con cambio obligatorio y además repone el rol `admin_sgc`, reactiva y desbloquea la cuenta, le quita el segundo factor, cierra sus sesiones y deja fila `restablecimiento` en Accesos (F11-D32) |

   **BD nueva desde cero:** `docker compose -f docker-compose.dev.yml up -d bd` →
   `npm run db:preparar` (migraciones y luego rol `sgc_app`) → `npm run db:seed` (demo)
   → **`npm run admin:asegurar`** (crea `admin` con la `ADMIN_CLAVE` de `.env.local`) → `npm run dev`
   → primer ingreso de `admin` con cambio de clave obligatorio → aviso de datos →
   portal. Las semillas vacían `usuarios`: tras cada `db:seed` hay que repetir
   `admin:asegurar` y cambiar la clave otra vez. El contenedor `app` del compose de
   desarrollo no trae `ADMIN_*`: su arranque omite el admin (lo dice en el log) y usa la
   misma base que `npm run dev` y los tests. **Tampoco monta el almacén:** una imagen
   construida desde la ola final de la Fase 12 ya no lleva `almacen/` (`.dockerignore`):
   arranca con el almacén vacío, así que en 9081 los documentos de la demo no tienen
   archivo, y un logo o un archivo subido en 9081 no existe para `npm run dev` (3002) ni
   al revés, aunque la base sea la misma (ver Deuda técnica). Para reconstruir solo la
   app sin tocar la base:
   `docker compose -f docker-compose.dev.yml up -d --build --no-deps app`.
4. **Usuarios demo** (tras `npm run db:seed`; **solo desarrollo**). Clave común
   `Demo-SGC-2026-clave`, sin cambio obligatorio y con el aviso aceptado:

   | Usuario | Rol | Cargo | Procesos |
   |---|---|---|---|
   | `coordinadora.sgc` | admin_sgc | Líder de Calidad | SGC |
   | `gerente` | gerencia | Gerente | — |
   | `control.interno` | control_interno | Jefe de Control Interno | — |
   | `lider.gth` | lider_proceso | Coordinadora de Talento Humano | GTH |
   | `lider.cex` | lider_proceso | Médico Coordinador | CEX |
   | `consulta` | consulta | Auxiliar de Enfermería | AIN, CEX |
   | `jefe.urgencias` | consulta | Enfermera Jefe | AIN |
   | `regente.farmacia` | consulta | Regente de Farmacia | ATE |

   Más `admin` (admin_sgc), con la `ADMIN_CLAVE` de `.env.local`, de `npm run admin:asegurar`,
   que pide cambiar la clave. La demo trae 5 áreas y 9 cargos con jerarquía, y **31 documentos con 35
   versiones** (29 vigentes, 2 obsoletas, 3 en borrador y 1 anulada), con la convención del hospital
   (`PROCESO-TIPO-NN`), dos plantillas (`SGC-FO-04` y `SGC-FO-05`), un restringido (`GTH-FO-01`), un
   formato de acta ficticio ya elegido (`SGC-FO-06`, con 4,2 y 3,2 cm; lo genera la semilla, no es el
   del hospital), nueve usuarios (ocho demo más `admin`), siete puntos de uso y dos listas de distribución y
   **cinco trámites** en distintas etapas, de `SOL-…-001` a `SOL-…-005`. Desde la Fase 12 trae además
   la marca de Suaza (sigla `HNSF`, primario `#1b4e8e`, secundario `#2e9b47`, el lema actual y el logo
   demo `src/db/semillas/recursos/logo-demo.png`, un monograma propio, no el escudo real) y una
   notificación "Bienvenida al SGC Integral" sin leer por usuario demo; todas las cuentas
   nacen con tema `claro`.
   `npm run db:seed:minima` deja una instalación nueva: "Entidad sin configurar", sigla
   `SGC`, los mismos dos colores, sin logo y lema vacío, aviso de datos de ejemplo, 12
   tipos de documento (con «Documento externo», `DE`) con su autoridad y su plazo de revisión, formato del código,
   plazos y ocho ítems de lista, los nueve tipos de norma y las claves de vigencia y metas; sin
   mapa, áreas, documentos ni usuarios (después hay que correr `admin:asegurar`). Una base
   heredada de `sgc-suaza` entra sin formato (sigue validando con su `patron_codigo` y no propone
   código), con todos los tipos operativos y los ocho ítems de la lista, que añade la migración 0005
   si la tabla está vacía: el Administrador del SGC fija el formato en **Configuración documental**
   y la autoridad en **Tipos de documento**.
   **Desde la 13C la demo trae además** (`src/db/semillas/vigencia-demo.ts`): **36 documentos con 41 versiones** (34
   vigentes: 30 internos y 4 externos, `CEX-DE-01`, `ATE-DE-01`, `SOG-DE-01` y `GTH-DE-01`, con su PDF), el formato
   ficticio del informe `SGC-FO-07` ya elegido, la carga inicial con 25 fechas fijadas por `coordinadora.sgc` y dos
   ratificaciones, doce normas reales con requisito por proceso (la 3100 deroga a la 2003, con un impacto pendiente sobre
   `CEX-GU-01`), la revisión anual del año abierta (GTH casi completo, CEX a medias, AIN sin líder), el sexto trámite
   `SOL-…-006` (nacido de la revisión) y «Todo el hospital» con el miembro «todos los usuarios activos». El detalle está en
   «Qué probar y cómo (Fase 13C)», paso 0. **La base de desarrollo NO se resembró en la 13C** (F13C-R20): la demo nueva se
   sembró y se probó en una base aparte; para tenerla, `npm run db:seed && npm run admin:asegurar`.
   **Desde la 14A la demo trae además** (`src/db/semillas/indicadores-demo.ts`, con su historia en
   `indicadores-demo-agenda.ts` y sus fichas en `indicadores-demo-fichas.ts`, todo por las funciones del dominio y con
   firmas reales): **14 indicadores**: los ocho del Excel del usuario, `SGC-IND-01` a `SGC-IND-08` (elaborados por
   `coordinadora.sgc` y aprobados en bloque por `gerente`, con sus históricos registrados), `SGC-IND-09` retirado,
   `AIN-IND-01` (urgencias, en minutos, que mide `jefe.urgencias` con rol Consulta), `CEX-IND-01` (el regulatorio, con la
   Resolución 256 de 2016), `GTH-IND-01` (restringido), `GTH-IND-02` por aprobar y `GRF-IND-01` en borrador; tres
   objetivos de calidad y dos institucionales; y el cierre de un mes anterior. El detalle está en «Qué probar y cómo
   (Fase 14A)», paso 0. Las fechas son relativas al día de la siembra. **La base de desarrollo NO se resembró en la 14A**:
   la demo se sembró y se probó en la base aparte `sgc_f14a`; para tenerla, `npm run db:seed && npm run admin:asegurar`.
   **La base de desarrollo se resembró en la 13B** (Tarea 15, con la demo de distribución; el recorrido de §18 la
   avanza otra vez). **También se resembró varias veces en la 13A** (Tareas 2 y 15, sus arreglos y el
   cierre): cada vez se pierden los datos de prueba manual y `admin` se recrea con la `ADMIN_CLAVE`
   de `.env.local` y cambio obligatorio.
5. **Tests:** 5696 en 235 archivos, más 1 saltado (la 13C cerró con 4722 en 197), en serie (`fileParallelism: false`), contra la BD de
   desarrollo sembrada y **conectados como `sgc_app`**, igual que la app; el test de
   privilegios usa además `DATABASE_URL_MIGRADOR`. Los usuarios de prueba con historia
   (`zz_<algo>_<timestamp>`) se acumulan porque no se pueden borrar (F11-D2); `db:seed` los
   limpia. `tests/semilla-tramites.test.ts` lee el estado de la demo: si ya se usó, salta lo que
   dependa de ella con un aviso. `SEMILLA_RECIEN=1 npm test` (en PowerShell, `$env:SEMILLA_RECIEN=1; npm test`), con la base
   recién sembrada, convierte esos saltos en fallos. Tras correr la suite conviene resembrar: deja usuarios `zz_*` y `admin_sgc`
   de prueba que inflan los selectores de designación. Un rojo es una señal real (salvo el
   intermitente de la Deuda técnica).
6. **CI (decisión de la bifurcación, tomada por Claude):** lint y build corren en cada
   push; el job de imagen ARM64 (GHCR + artefacto `.tar`) solo corre con **Actions →
   CI → Run workflow**. Motivos: la cuota de almacenamiento de Actions es de la cuenta y
   la comparte con `sgc-suaza` (se agotó el 2026-08-25) y cada build ARM64 por QEMU es
   lento. La imagen `amd64` del CI llega en la Fase 20. La Fase 11 añadió `otpauth`,
   `qrcode` y `zod` (todos JS puro); las Fases 12, 13A, 13B, 13C y 14A no añadieron dependencias. No consta que el
   job ARM64 se haya relanzado desde la Fase 11: lanzarlo a mano antes de la Fase 20.
7. **Despliegue: decidido en el spec §4 y escrito en `AGENTS.md` ("Piso de despliegue")**
   (contenedores portables, Windows con WSL2 o Linux, tres contenedores proxy + app +
   bd; se construye en la Fase 20). Los archivos de despliegue heredados del NAS
   (`docker-compose.nas.yml`, `INSTALACION*.md`, `nas/`) conservan el puerto 9080, los
   nombres `sgc-app`/`sgc-bd` y la carpeta `/share/sgc-documentos` del original. La
   Fase 11 solo les añadió lo mínimo para arrancar: `APP_SECRETO` obligatorio (sin él la
   imagen de producción **no arranca**), `DATABASE_URL_MIGRADOR` y `SGC_BD_APP_CLAVE`
   opcional; la app sigue conectando como dueño allí, y `INSTALACION*.md` no describen
   las variables nuevas. La Fase 20 los reemplaza. El ensayo local
   (`docker-compose.ensayo.yml`) publica 9080, que en esta máquina ocupa `sgc-app-1` de
   la original.
8. **Pendientes heredados del usuario** (siguen valiendo aquí): documentos reales
   aprobados y logo institucional. La **convención oficial de códigos quedó resuelta el
   2026-11-05**: sigla del proceso, sigla del tipo y consecutivo de dos dígitos contado por
   proceso y tipo (`SGC-FO-02`); la implementó la 13A. Desde la Fase 12 el logo se sube en **Entidad y marca** y debe ser
   PNG, JPG o WebP (SVG no, F12-DC9): pedirlo en PNG cuadrado de unos 512 px con fondo
   transparente. La subida de Next quedó hecha en la Fase 11 (16.4.5).
9. **Memoria de Claude Code:** es por carpeta; la de `F:\sgc-integral` solo guarda
   preferencias de trabajo del usuario (decide por listas numeradas; recomendaciones con
   base ISO, Regulación o Práctica). Este archivo es el contexto durable de la variante.

## Entrega complementaria de la 14A: rangos, códigos e importación

Spec: `docs/superpowers/specs/2026-11-13-fase14a-rangos-e-importacion-design.md` (amplía el de la Fase 14); plan:
`docs/superpowers/plans/2026-11-13-fase14a-rangos-e-importacion.md`. La rama `f14a-rangos-importacion` (39 confirmaciones
sobre `main`, `4afd205`, que ya trae la 14A fusionada) se trabajó en el mismo worktree `F:\sgc-integral-f14a`, contra la base
aparte `sgc_f14a`; **no está publicada ni fusionada** y espera el recorrido del usuario. Nació de lo que el hospital ya
tiene: una matriz institucional de 258 indicadores aprobada por el Gerente (`SGC-TI-002`, versión 1, 11/09/2026) y
fichas con rangos escritos a criterio del creador (`crítico 0-40, atención 41-90, bien 91-100, meta 100`), con códigos de
la forma `CNT-ID-001` (sigla del subproceso). **Sin dependencias npm nuevas.** Una migración, la `0012`; trece en total
(`drizzle/0000` a `drizzle/0012`).
**Verificado el 2026-11-13, al cierre de la ola final**, por el guard, sobre `sgc_f14a` recién sembrada: `npm run lint` limpio;
`SEMILLA_RECIEN=1 npm test`, 240 archivos y 5997 pruebas en verde con 1 saltada (la de siempre, de ratificaciones); `npm run
build` sin URL de base en verde.

### Hecho (entrega complementaria de la 14A)

- **Rangos del semáforo por estado (Parte A, forma B).** La ficha escribe una fila por estado con un signo (`≥`, `>`, `≤`,
  `<` o «entre») y uno o dos números; Bien puede empezar antes de la meta. Reglas puras en `src/lib/indicadores/rangos.ts` y
  `semaforo.ts` (fracciones exactas; «entre» incluye sus dos extremos; más allá de la punta manda el rango de la punta; un
  hueco de más de una unidad, rangos cruzados, orden contrario a la tendencia o una meta fuera de Bien se rechazan con su
  mensaje junto al campo). `EditorDeRangos` en el formulario, con «Este indicador no usa Atención» y, en «constante», Bien en
  medio. Las versiones aprobadas conservan su regla vieja (un umbral sobre la meta; su huella no cambia) hasta su próximo
  cambio mayor; el parámetro «Umbral de atención» ya no está en la configuración.
- **`cumple` distinto de Bien.** La medición guarda `cumple` (alcanzó la meta) junto al semáforo; una medición anterior a la
  `0012` lo tiene nulo y se lee como antes (`cumpleDeFila`). Un **«Bien que no cumple»** lleva su nombre («Bien · no alcanza
  la meta» en la insignia; «Bien, no alcanza la meta» en el nombre accesible y la tabla; «✓\*» en la matriz, «Bien\*» impreso), pide análisis y avisa como un Atención, y cuenta en la racha. Solo
  `recalcularMedicion` lo escribe.
- **Sigla de los subprocesos y códigos del hospital (Parte B).** `subprocesos.sigla`, opcional y única entre procesos y
  subprocesos; la propone, al crear una ficha, `SIGLA-ID-NNN` (tres cifras, por sigla, sin reusarse) con la del subproceso o,
  si no tiene, la del proceso; `ID` queda reservada como `IND`. Los `-IND-` antiguos siguen valiendo. **Nivel** y **Riesgo
  asociado** son campos de texto opcionales de la ficha.
- **Importación (Parte C).** `/admin/indicadores/importar`: plantilla propia de 26 columnas (hoja «Indicadores», instrucciones y
  listas), subida de una plantilla por lote (`POST /api/importaciones-indicadores/[id]/archivo`, fuera del `matcher`),
  vista previa por fila con problemas, avisos y correspondencias de subproceso, cargo, tipo y unidad, aprobación previa y regla
  de rangos por lote, siglas por dar, e importación todo o nada con la clave de quien importa. Las «Aprobado» entran aprobadas
  (`importacion_id` y `aprobacion_previa_*`, sin firma «Aprobó» ni aviso; la constancia con clave es el evento `importado`) y
  los periodos anteriores quedan históricos; las «Propuesto», en borrador. **Deshacer** el lote entero con motivo y clave
  mientras nada tenga trabajo hecho en la app, con la única excepción estrecha del trigger de las versiones aprobadas
  (`sgc.deshacer_importacion`). Tablas `importaciones_indicadores` e `importacion_eventos`, de solo inserción; contexto de
  archivo `importacion_indicadores`. La ficha importada dice «Aprobada antes de la implementación de SGC Integral», con el
  documento, quien aprobó, la fecha y quién importó.
- **La demo.** `CNT-ID-001` «Oportunidad en el cierre contable» (mensual, meta 100, Bien ≥ 91 · Atención entre 41 y 90 ·
  Crítico ≤ 40) en Gestión Contable, que ahora tiene la sigla `CNT`: un periodo en 95 (verde que no cumple, con su análisis) y
  otro en 100. Y un lote importado de dos fichas, con su plantilla real en el almacén: `TSR-ID-001` «Oportunidad en el pago a
  proveedores» (aprobada, Gestión Tesorería, que recibe la sigla `TSR`) y `GRF-ID-001` «Ejecución del presupuesto de gastos»
  (propuesta, borrador), con la aprobación previa «SGC-TI-002 v1», «Gerente», 2026-09-11. **`SGC-IND-06` cambió respecto de la
  demo de la 14A:** su meta programada del tercer trimestre es ahora 90 (antes 70, que quedaría fuera de su Bien ≥ 80), y su 17
  de 20 = 85 % queda en **Bien sin alcanzar la meta**, con su análisis (sin él quedaría abierta y vencida). Código nuevo de la
  semilla: `src/db/semillas/indicadores-demo-importacion.ts`.
- **Ola final de la revisión de toda la rama** (2026-11-13; hallazgos y decisiones en
  `.superpowers/sdd/2026-11-13-fase14a-rangos-e-importacion/ola-final.md`): un cambio mayor no se envía ni se aprueba con una
  meta programada fuera de su Bien (F14AC-R15); «Inicio de medición» de la plantilla tiene ventana y aviso de históricos, y la
  vista previa muestra el inicio, la periodicidad y la fórmula con los nombres de sus variables (F14AC-R14); la sigla del
  código solo se ofrece si el mapa la aceptaría, los errores de las siglas nombran el subproceso y deshacer revisa que el
  registro del lote liste todas sus versiones (F14AC-R16); la etiqueta del límite con un borde cerrado dice «Crítico hasta
  40 %»; la barra de la lista cuenta los Bien sin cumplir; el renglón «Bien\*» de la leyenda solo se imprime; `SGC-IND-06`
  trae su análisis; un test fija que renombrar una ficha con la regla vieja se envía y se aprueba sin rangos (Review Focus 3).
- **Documentación:** `AGENTS.md` (regla 5 con sus dos excepciones nombradas, contextos de `archivos`, código de la ficha,
  la importación, `cumple`), el capítulo 8 del manual (secciones 2.1, 2.3, 2.5, 6.1, 6.5, 6.9 y la nueva 6.10) y la fila de
  `PLAN.md`.

### Qué probar y cómo (entrega complementaria de la 14A)

Los ocho pasos de §8 del spec, sobre la demo que la semilla deja y sus usuarios (clave de la demo `Demo-SGC-2026-clave`, la de la
tabla de «Qué probar y cómo (Fase 14A)»; nunca otras credenciales). **No lo ha recorrido todavía el usuario.**

0. **Preparar.** En la carpeta de la rama, `npm run db:preparar` (aplica la `0012` a su base) o la imagen, que la aplica sola;
   **reinicie `npm run dev`**; resiembre justo antes de empezar: `npm run db:seed && npm run admin:asegurar`. Entre como
   `coordinadora.sgc` (Administrador del SGC); `gerente` y `lider.cex` para lo que sigue.
1. **Rangos escritos (§8.1).** **Indicadores** → `CNT-ID-001`: la ficha dice «Bien ≥ 91 · Atención entre 41 y 90 · Crítico ≤ 40»,
   meta 100. Su primer periodo reportado (septiembre, si siembra el 2026-11-13) está en 95: **«Bien · no alcanza la meta»** (verde
   con letras, «✓\*» en la matriz), con su análisis, y el siguiente, en 100, cumple. La punteada de la gráfica dice «Crítico
   hasta 40 %» (el 40 es Crítico: «≤ 40»). En la lista, la barra dice entre paréntesis cuántos Bien no alcanzan la meta
   («… bien (1 sin alcanzar la meta)», el de `SGC-IND-06`: el último periodo de `CNT-ID-001` cumple). Cree una ficha nueva con
   esos rangos y reporte 95, 90,5 (Atención) y 105 (Bien, cumple): el 95 pide análisis.
2. **Menos es mejor sin Atención (§8.2).** Ficha nueva «menos es mejor» con **Este indicador no usa Atención**
   («Bien ≤ 30 · Crítico > 30»); reporte 31 dos periodos seguidos y mire la racha («2 periodos sin cumplir»).
3. **Rangos inválidos (§8.3).** En el formulario, rangos cruzados, un hueco de 40 a 60 o una meta fuera de Bien: el SGC lo
   rechaza junto al campo.
4. **Sigla del subproceso (§8.4).** **Administración** → **Mapa de procesos** → Gestión Contable ya tiene `CNT` (la de la demo);
   dele una sigla de 2 a 4 letras a otro subproceso y cree una ficha en él: el código propuesto es `SIGLA-ID-001`.
5. **Importar (§8.5).** **Administración** → **Configuración de indicadores** → **Importar indicadores**: **Descargar la plantilla**,
   llénela con unas filas de la matriz (una con un subproceso de nombre distinto, una «Propuesto», una con código repetido),
   súbala en **Nueva importación**, mire la vista previa, resuelva la correspondencia, escriba la aprobación previa y pulse
   **Importar** con su clave. Use códigos que la demo no tenga (`TSR-ID-001`, `GRF-ID-001` y `CNT-ID-001` ya están ocupados
   por la demo). La vista previa dice la periodicidad, el **Inicio** y la fórmula con los nombres de sus variables; un
   «Inicio de medición» fuera de la ventana (de enero de hace cinco años al mes de la importación; por ejemplo `1026-09`)
   bloquea la fila, uno con más de 24 periodos históricos lo avisa, y una sigla del código que el mapa no aceptaría (ocupada,
   reservada o de más de cuatro letras) no se ofrece: la fila lo avisa.
6. **La ficha importada (§8.6).** `TSR-ID-001` (la del lote de la demo, o la suya): «Aprobada antes de la implementación de SGC
   Integral», con el documento, quien aprobó, la fecha y quién importó; sus rangos son los de la regla del lote (Atención desde
   el 90 % de la meta); sin tareas vencidas; `TSR-ID-001` de la demo se importa con inicio en el mes en curso y no tiene periodos históricos: para ver los históricos «Por registrar», importe un lote propio con «Inicio de medición» anterior.
7. **Deshacer (§8.7).** En la página del lote que acaba de importar, **Deshacer la importación** con motivo y clave: las fichas
   desaparecen, los códigos quedan libres, la bitácora lo cuenta y la misma plantilla corregida entra otra vez. Con una ficha
   del lote ya reportada o con un periodo cerrado («tiene periodos cerrados o con datos»), o con una propuesta enviada a
   aprobación, el botón no se ofrece y la página dice por qué.
8. **Lo anterior no cambió (§8.8).** Las fichas de la demo de la 14A (`SGC-IND-01`, `AIN-IND-01`, `CEX-IND-01`…) siguen con su
   color de siempre: la semilla las crea ahora con los rangos equivalentes a su regla (70 % de la meta). **Del recorrido de la
   14A cambiaron** el paso 0 (`SGC-IND-06`: meta programada de 90 y un Bien sin cumplir, con su análisis), el 2 (una ficha
   nueva escribe sus rangos y su código propuesto es `SGC-ID-001`), el 4 (los códigos `SGC-ID-00…`), el 10 (una meta
   programada debe caer dentro de Bien) y el 13 (en el resumen del cierre, los Bien sin cumplir ya analizados no salen como
   «sin análisis»). Un cambio mayor no se envía ni se aprueba mientras una meta programada desde su «Rige desde» quede fuera
   de su Bien («La meta programada del … queda fuera del rango de Bien de esta versión: reprográmela antes de enviar»).
   **La regla vieja no se ve en esta demo** (todas sus fichas tienen rangos). Para verla, si quiere (no hace falta para
   cerrar la entrega): con `main` (`4afd205`) siembre una base de prueba (`npm run db:seed && npm run admin:asegurar`),
   cambie a esta rama sobre esa misma base y corra `npm run db:preparar` (aplica la `0012`); reinicie `npm run dev`. `SGC-IND-01` y `AIN-IND-01` siguen con los
   mismos colores y frases; renombre una ficha (**Abrir un cambio**, otro nombre, **Publicar el cambio menor**): se envía
   sin escribir rangos y conserva su regla; abra otro cambio: la ficha muestra su regla anterior con **Escribir los rangos**
   (que parte de los equivalentes), y si sube la meta sin escribirlos, el SGC responde «Un cambio mayor escribe los rangos
   del semáforo: complete Bien, Atención y Crítico».

### Avisos para el usuario (entrega complementaria de la 14A)

1. **La migración `0012` es aditiva** (columnas `cumple`, `rangos`, `nivel`, `riesgo_asociado`, `sigla`, `importacion_id` y `aprobacion_previa_*`, las tablas del
   lote y la excepción estrecha del trigger de las versiones aprobadas). Antes de `npm run dev` corra **`npm run db:preparar`**, o use
   la imagen, que la aplica sola al arrancar. Las mediciones y fichas que ya tiene se leen igual que antes.
2. **La plantilla y cómo pasar la matriz del hospital.** Descárguela de **Importar indicadores**; no se lee la matriz tal cual.
   Separe **Variable A** y **Variable B** (la fórmula de la matriz va partida; la forma y el factor salen de la unidad); ponga el
   **proceso por su sigla** y el **subproceso por su nombre del mapa** (lo que no coincida se resuelve en la vista previa); escriba
   la **meta en la unidad** (95, no 0,95, y sin punto de miles); llene **Cómo se junta** con «Último valor» para poblaciones,
   inventarios y totales del Listado Maestro (algo que se cuenta en un momento) y déjelo vacío para lo que se suma. Hasta 500 filas.
   Un `.xlsx` que no es la plantilla (o que cambió sus encabezados) deja el lote inservible: cree otra importación.
3. **La regla de los rangos de lo importado.** La matriz no trae rangos por indicador: cada ficha con meta toma la regla general
   del lote, **Atención desde el 90 % de la meta** (ascendente) y **hasta el 110 %** (descendente), con Bien desde la meta; se
   puede cambiar en la vista previa. Una ficha sin meta entra sin rangos ni alertas.
4. **`ID` reservada.** Igual que `IND`, la sigla `ID` no se acepta en procesos, subprocesos ni tipos de documento. Un proceso o
   un tipo de documento que ya tuviera `ID` o `IND` no se podrá editar sin cambiarla.
5. **Las fichas aprobadas antes conservan su regla** (un umbral sobre la meta, 70 % por omisión) hasta su próximo cambio mayor, que
   pide escribir los rangos; «Crear a partir de este» sobre una de ellas también los pide.
6. **Lo importado no designa a nadie para medir:** las fichas aprobadas quedan activas, con sus cargos responsables y sin
   personas; el Administrador del SGC las designa después (la importación no genera tareas ni avisos).
7. **El lote es todo o nada para las filas sin problemas y se deshace entero**, y la misma plantilla corregida puede entrar
   otra vez. La plantilla subida queda en el volumen `almacen`, bajo `importaciones/<lote>/`, y entra en el respaldo con él.

### Decisiones adicionales (entrega complementaria de la 14A)

F14AC-D1 a D15 son las del §9 del spec de la entrega (2026-11-13); F14AC-R1 a R12 son las resoluciones del controlador durante la
ejecución que cambian lo que el usuario ve o lo que el spec decía (entre paréntesis, el «Ruling» de la bitácora de ejecución,
`.superpowers/sdd/2026-11-13-fase14a-rangos-e-importacion/progress.md`). Mandan sobre el plan.

| # | Decisión y porqué |
|---|---|
| F14AC-D1 | Un Bien que no cumple avisa como Atención (no escala a líderes ni al Administrador; si se repite, escala como un Atención repetido, F14AC-R3): el verde no es una falla, pero la meta no se alcanzó y alguien debe mirarlo |
| F14AC-D2 | «Entre» incluye sus dos extremos y más allá de la punta manda el rango de la punta: así ningún número cae sin color |
| F14AC-D3 | Un hueco de más de una unidad entre rangos es un error: un valor sin color sería peor que un rechazo |
| F14AC-D4 | Las metas programadas por periodo deben caer dentro de Bien y los rangos no se mueven con ellas: la meta del periodo no reescribe la regla firmada |
| F14AC-D5 | Las versiones aprobadas conservan su regla vieja; la forma B rige para fichas nuevas y cambios mayores: no se reescribe lo aprobado ni su huella |
| F14AC-D6 | «Mantenerse en un rango» usa la forma B, con Atención y Crítico a cada lado de Bien |
| F14AC-D7 | Sigla de subproceso opcional y única; código `SIGLA-ID-NNN` con tres cifras; `ID` reservada, como `IND`: así el código de la ficha no se confunde con el de un documento |
| F14AC-D8 | Plantilla propia en vez de leer la matriz tal cual; la aprobación previa y la regla de rangos van por lote: la matriz no es una estructura estable y no trae rangos |
| F14AC-D9 | Importación todo o nada para las filas sin problemas, con la clave de quien importa: una importación es una decisión firmada |
| F14AC-D10 | Los periodos que terminaron antes de la importación son históricos: no generan tareas, avisos ni marcas |
| F14AC-D11 | Nivel y riesgo asociado como campos de texto de la ficha: son lo que la matriz del hospital trae y no justifican un catálogo |
| F14AC-D12 | No se designan personas al importar; los cargos sí: la matriz trae cargos, no personas |
| F14AC-D13 | Una fila de Atención con un solo signo llega hasta donde empieza Bien y las filas se guardan como se escribieron: la ficha firmada muestra lo que la persona escribió |
| F14AC-D14 | «Cómo se junta» de cada variable es una columna opcional de la plantilla («se suma» por omisión), con su explicación: poblaciones y totales no se suman |
| F14AC-D15 | Deshacer es del lote entero; la constancia de quién importó va en un registro del lote (no en `firmas`) para que deshacer sea posible; la excepción al trigger es la más estrecha posible |
| F14AC-R1 (5) | Los mensajes de orden son «En «más es mejor», Crítico va abajo, Atención en medio y Bien arriba» y sus espejos, y se revisan después del «entre» invertido y antes de «se cruzan»: el spec §3.4 lo exigía y el brief no traía texto |
| F14AC-R2 (7, 8) | En «constante», una fila de un solo signo que se abre hacia Bien llega hasta la fila mejor de su lado y Crítico va a los dos lados de Bien: sin ese lado, la regla de la punta pintaría Bien fuera del rango |
| F14AC-R3 (13) | Un Bien sin cumplir repetido escala a nivel crítico (avisa a líderes y Administrador), como hoy un Atención repetido: el Atención repetido ya se trata como crítico para las alertas |
| F14AC-R4 (14) | La demo programa una meta dentro de Bien (`SGC-IND-06`: 90 sobre Bien ≥ 80) con un resultado en Bien sin alcanzarla: muestra a la vez la meta ajustada y el «Bien que no cumple» |
| F14AC-R5 (16, 18) | «Crear a partir de este» sobre una ficha de regla vieja pide escribir los rangos, y un borrador viejo que sería ficha nueva o cambio mayor no se envía sin ellos; «regla anterior» solo se ofrece si la ficha tiene versión aprobada |
| F14AC-R6 (19) | El Excel del indicador, la insignia en vivo, la prueba de la fórmula y la leyenda impresa llevan la salvedad del Bien sin cumplir: ningún verde engaña, tampoco en las salidas |
| F14AC-R7 (23, 24) | «Laboratorio Clínico (LAB)» solo se empareja con un subproceso llamado así (si no, va a correspondencias) y la plantilla exige las 26 columnas, también las opcionales: una columna faltante es señal de un archivo ajeno |
| F14AC-R8 (25, 26, 27) | Los datos que sobran para la forma (Variable B en Conteo, Factor o Fórmula libre sin usar), una meta con punto de miles («1.000») y una celda sin resultado bloquean la fila (nada aprobado se pierde en silencio); la meta vacía se admite (la ficha solo se vigila) con un aviso en la vista previa |
| F14AC-R9 (30) | Una celda con error de Excel o una fórmula sin resultado bloquea la fila con su mensaje: leerla vacía crearía una ficha sin meta |
| F14AC-R10 (32) | Los «Propuesto» son borradores normales, sin `importacion_id` ni aprobación previa; el lote los recuerda por el `detalle` del evento `importado`: si no, una propuesta aprobada en la app saldría como «aprobada antes de SGC Integral» |
| F14AC-R11 (34, 35, 38, 40) | El archivo del lote responde 404 a quien no administra indicadores; si el conjunto importable cambió entre la vista y la clave, se aborta con «La vista previa cambió mientras se importaba: revísela y vuelva a importar»; el formulario manda los códigos de la vista y se comparan como lista (el envío multipart cambia LF por CRLF): nadie firma un lote distinto del que vio |
| F14AC-R13 (3) | «Importó … el …» de la ficha importada sale del evento `importado` (quien confirmó con la clave), no de quien subió el archivo: la constancia con clave es la del evento |
| F14AC-R12 (42) | Una propuesta del lote impide deshacer si ya se envió a aprobación o se aprobó, o si se modificó después de importarse: deshacer no debe borrar trabajo hecho en la app |
| F14AC-R14 (46) | «Inicio de medición» de la plantilla se acepta de enero de cinco años antes al mes de la importación («El inicio de medición «…» está fuera de la ventana de AAAA-01 a AAAA-MM»); con más de 24 periodos históricos, «Abre N periodos históricos por registrar»; la vista previa muestra el inicio: un error de digitación no puede dejar una ficha aprobada que nunca se mide ni mil históricos |
| F14AC-R15 (ola final) | Enviar y aprobar un cambio mayor revisan, de solo lectura y otra vez con el indicador bloqueado (el candado de `programarMeta`), que las metas programadas desde su «Rige desde», de su periodicidad, caigan dentro de su Bien: `programarMeta` solo las revisó contra la versión que regía, y un 92 con Bien ≥ 95 saldría Atención «frente a una meta de 90» |
| F14AC-R16 (ola final) | La sigla del código se ofrece a un subproceso solo si el mapa la aceptaría (formato, no reservada, libre también entre los inactivos) y no la proponen dos subprocesos ni dos siglas uno; si no, la fila lo avisa. Deshacer dice «tiene periodos cerrados o con datos» y rechaza un lote cuyo registro no lista todas las versiones que llevan su id |

### Deuda técnica (entrega complementaria de la 14A)

Todos menores; son los «minor (deferred)» de la bitácora de ejecución que siguen abiertos, por módulo. Pasan también a «Deuda
técnica conocida».

- **Para la 14B:** al dar escritura a `impactos_indicadores`, `reportes_externos` o a variables con `indicador_origen_id`,
  **añada su motivo a `condicionDeDeshacer`** (hoy un lote con una de esas filas abortaría con 23503 sin borrar nada).
  Retirar una ficha del lote o cambiar sus datos de operación no impide deshacer; los avisos enviados quedan apuntando a filas
  borradas.
- **Reglas puras de los rangos:** una fila de un solo signo de Atención en «constante» se rechaza con «se cruzan» (mensaje confuso,
  rechazar es seguro); `rangosATexto` trunca a 10 decimales los límites periódicos (R6 de la bitácora; la copia va a aprobación);
  la condición «máximo por debajo del mínimo» está duplicada en `errorDeRegla`; `rangosEnPalabras` en modo rangos escribe
  rangos inválidos; en «constante», una fila de un solo punto metida dentro de una fila peor se acepta y deja colores no
  monótonos (84 atención, 84,5 crítico), y faltan tests del desempate «gana el mejor»; `rangos.ts` no tuvo fase RED propia.
  **Residuo R3-3:** `errorDeRangos` salta las filas de tramo vacío (`|| vacio(peor.tramo)`, en el repaso de las filas que
  nunca se ven), así que con Bien de un punto y Atención de un punto se acepta un Crítico que nunca pinta (los colores siguen
  monótonos).
- **Esquema y migración:** dos FK de 66 bytes se truncan (NOTICE, como en la 0008 a la 0011); el JSDoc de `CONTEXTOS_EVIDENCIA`
  está desactualizado; el trigger de hijas solo se prueba en `indicador_variables` (no en responsables
  ni normas) y el control negativo del trigger (`DROP TRIGGER`) solo cubre `importaciones_indicadores`, no `importacion_eventos`.
- **Cálculo y alertas:** `estadoEnPalabras` con `cumple?` opcional al final (`alertas.ts:49`); faltan tests de `sin_analisis` al
  cierre y de `falta: "analisis"` en tareas para un
  Bien sin cumplir; ninguna prueba con base verifica que la lista, «Último resultado» y la matriz llevan `cumple` hasta la vista;
  la redacción «sin alcanzar la meta» (leyenda, alertas) frente a «no alcanza la meta» (insignia) la fijó el brief.
- **Ficha y formulario:** faltan tests de la regla vieja con `fijo` y con constante/tolerancia y de un borrador nunca aprobado que
  manda `relativo`; con rangos, un `semaforoModo` viejo se ignora sin
  aviso; `rangosEnJson` sin `.max()` antes de `JSON.parse`; en «constante», dejar en blanco los dos lados de Atención equivale a
  «no usa Atención» sin marcar la casilla; cambiar la tendencia borra los números y los rangos escritos; el mensaje del servidor
  de una fila vacía («Los valores de los rangos deben ser números») no coincide con el de la vista; el movimiento de foco no
  tiene prueba (sin entorno DOM).
- **Siglas del mapa:** una carrera proceso↔subproceso con la misma sigla (READ COMMITTED; un `pg_advisory_xact_lock` en
  `exigirSiglaDeMapaLibre` la cerraría); la bitácora de `asignarSiglaASubproceso` guarda solo `{sigla}`; el test de la carrera
  del 23505 confirma una sigla en un subproceso propio (slugs `zz-carrera-*`) y la borra en `finally`.
- **Plantilla y vista previa:** «1.000.000» en Meta dice «no es un número» en vez de «es ambigua» y «0.500» se marca ambigua;
  la columna Meta no va en formato texto (en un Excel en inglés «1.000» se vuelve 1 antes de llegar a la app); un código repetido
  tres o más veces nombra solo la primera y la última fila; una fila con error en una columna obligatoria suma el «falta».
- **Importar y deshacer:** una sigla elegida no se ata a la que propone la fila; `vistaPreviaAccion` pasa por `mutacion()` (gasta
  el limitador); la ruta de subida carga `exceljs` por importar `autorizarArchivoDeLote`; `extra!` en `escribirFichaNueva` y sin
  test de una falla a mitad del bucle; la comparación del Ruling 35 solo mira códigos (no un cambio de estado o de subproceso de
  la misma fila); `normalizar` del servidor usa la copia de `formulario.ts`; si la red se corta después de guardar el archivo,
  el reintento de `SubirPlantilla` recibe 409 y no navega al lote ya cargado; el «N fichas» de la página y del diálogo cuenta del evento (una de más si una propuesta se borró en la app); el diálogo no
  menciona que también se borran las metas programadas, y «La importación no existe» sirve para un id forjado; el 23505 del
  deshecho solo se prueba por mutación; la rama del 23505 del evento `importado` no tiene prueba de carrera real.
- **Formulario de rangos (Tarea 5, más):** `JSON.parse` de los rangos corre en cada render (`FormularioFicha.tsx`).
- **Metas programadas y cambio mayor (ola final):** `programarMeta` revisa la meta contra la versión que rige hoy; si el Bien de
  esa versión y el del cambio mayor no se tocan (dos «entre» sin parte común, o un cambio de tendencia), ninguna meta pasa las dos
  revisiones y el cambio no se puede enviar sin devolverlo y escribir otros rangos (no hay un «quitar la meta programada»). En la
  aprobación en bloque, el mensaje de la meta no nombra la ficha (los demás de `validarAprobacion` sí).
- **Importación (ola final):** el tope de 500 filas cuenta las filas con algún valor (`actualRowCount`), también las de solo
  espacios o de celdas combinadas, que la lectura salta.
- **Ficha importada:** si falta el evento `importado`, la versión importada se mostraría «Sin firma» (un `LEFT JOIN` y una frase
  sin «Importó…» sería más honesto) y el control de cambios impreso dice «Importada» sin documento ni fecha.

## Qué probar y cómo (Fase 14A)

Recorrido de los veinte pasos de la 14A de §24 del spec de la fase
(`docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md`), ordenados y adaptados a la demo que la semilla deja de
verdad (`src/db/semillas/indicadores-demo.ts` y su agenda): entre paréntesis, el paso de §24 que cubre cada uno. El
capítulo 8 del manual (`docs/manual/usuario/08-indicadores.md`) explica cada pantalla por persona. **No lo ha recorrido
todavía el usuario.** El controlador lo recorrió en el navegador el 2026-11-12 sobre la base aparte (claro, oscuro, 390 px
y la pantalla de reporte solo con el teclado); lo que no salió como decía se corrigió en la app o aquí (ronda 1).

0. **Preparar.** Con la rama de la 14A en su carpeta, **reinicie `npm run dev`** (uno arrancado antes sirve la matriz de
   permisos vieja, sin `indicadores.*`) y **resiembre justo antes de empezar**: `npm run db:seed && npm run
   admin:asegurar` (vacía la base y `./almacen`; `admin` vuelve a pedir el cambio de clave). Arrancar la app de la rama o
   `npm run db:preparar` aplica antes la migración `0011` a su base. Abra `http://localhost:3002` y use ventanas privadas
   para tener varias sesiones; para el celular, `DEV_ORIGENES` como en la 13B.

   | Usuario | Clave | Papel en el recorrido |
   |---|---|---|
   | `coordinadora.sgc` | `Demo-SGC-2026-clave` | Administrador del SGC: crea, cambia y configura fichas, designa, programa metas, cierra el mes y reabre; está designada para medir y analizar los del SGC |
   | `gerente` | ídem | Aprueba las fichas estratégicas, las regulatorias y las de los procesos sin líder (SGC, AIN); hace seguimiento de `SGC-IND-01` |
   | `control.interno` | ídem | Ve todo, también lo restringido; deja observaciones |
   | `jefe.urgencias` | ídem | Rol Consulta: mide y analiza `AIN-IND-01` sin ser líder |
   | `lider.cex` | ídem | Líder de CEX: mide `CEX-IND-01`; su cargo (Médico Coordinador) es el jefe de la Enfermera Jefe en la estructura |
   | `lider.gth` | ídem | Líder de GTH: mide `GTH-IND-01` (restringido); le toca aprobar `GTH-IND-02` |
   | `consulta` | ídem | Rol Consulta, asignada a AIN y CEX y sin designaciones: ve los generales, sus resultados y su análisis, no los soportes ni las observaciones |
   | `admin` | La `ADMIN_CLAVE` de `.env.local` | Segundo Admin SGC: recibe las alertas críticas |

   Lo que la demo trae, sembrada el 2026-11-12 (los periodos se cuentan desde el día de la siembra; con qué fechas sale
   igual, en el aviso 4 de «Avisos para el usuario (Fase 14A)»):

   - **Los ocho del SGC del Excel** (`SGC-IND-01` a `SGC-IND-08`; trimestrales salvo `SGC-IND-03`, semestral, y `SGC-IND-04`,
     anual), elaborados por `coordinadora.sgc` y aprobados en bloque por `gerente`, con sus históricos registrados (los
     dos primeros trimestres; el semestre o el año en el 03 y el 04). El tercer trimestre, reportado: **`SGC-IND-01` 3 de 5
     = 60 % Crítico**, con causa, acción propuesta, «Requiere acción de mejora», la alerta sin leer de `gerente` y una
     **observación de `control.interno` sin respuesta**; `SGC-IND-02` 6 de 8 = 75 % **Atención** con su análisis; `SGC-IND-06`
     17 de 20 = 85 % en **Bien sin alcanzar la meta programada de 90** (la ficha dice 80 y su Bien empieza en 80), con su
     análisis; `SGC-IND-08` **«No aplica»** con su motivo; `SGC-IND-05`
     con **tres versiones** (la 1 con meta 85; la 2, cambio mayor a 90, aprobada por `gerente` y vigente desde el cuarto
     trimestre; la 3, cambio menor de la fuente de una variable, sin aprobador). `SGC-IND-09` **retirado**.
   - **`AIN-IND-01` «Tiempo de espera en triage II»** (Urgencias, minutos, «Promedio o razón», menor es mejor, meta 30,
     mensual; mide y analiza `jefe.urgencias`): mayo y junio en Bien, **julio sin dato** (lo dejó así el cierre), agosto en
     Atención con su análisis, **septiembre vencido** (la única medición ordinaria por reportar) y octubre en Bien
     (27 min, reportado y sin cerrar).
   - **`CEX-IND-01` «Oportunidad en la asignación de cita de medicina general»** (regulatorio, **Resolución 256 de 2016**,
     días, menor es mejor, meta 3, mensual; mide `lider.cex`): de mayo a octubre en Bien; **julio salió en Atención, se
     cerró, se reabrió con justificación, se corrigió a 2,9 y se cerró de nuevo** («Corregida»).
   - **`GTH-IND-01` «Rotación de personal»**, **restringido** (trimestral, meta 5 %, aprobó `lider.gth`); **`GTH-IND-02`
     por aprobar** (le toca a `lider.gth`); **`GRF-IND-01`** en borrador, nunca enviado (Gestión de Cartera).
   - Tres objetivos de calidad y dos institucionales. **El cierre de agosto** (24 mediciones), hecho a mediados de
     septiembre; el mes que se propone cerrar es septiembre. La demo no trae soportes.
   - Avisos sin leer: `coordinadora.sgc` «Observación en SGC-IND-01», `gerente` la alerta del crítico de `SGC-IND-01`,
     `lider.cex` «Medición reabierta en CEX-IND-01» y `lider.gth` «Ficha por aprobar: GTH-IND-02 · …». Los demás avisos de
     la siembra quedan leídos.

1. **Vencido y escalamiento (§24.17).** La primera página que alguien abre después de sembrar dispara la revisión de
   vencimientos (corre al usar el SGC, cada diez minutos como mucho), con el reloj real. **Mírelo antes del paso 7**, que
   reporta ese periodo. Como `jefe.urgencias`: la campana «Tiene 1 indicador por reportar con el plazo vencido», la insignia
   «1» junto a **Indicadores**, en **Mis tareas** «Reportar AIN-IND-01 Tiempo de espera en triage II, septiembre de 2026»
   con **Vencida**, y en la lista la columna **Reporte** con «Vencido hace N días». Como `lider.cex`, el escalamiento
   «Reportes de indicadores vencidos»: «1 reporte de indicadores a cargo de Luz Dary Ortiz sigue vencido. Venció hace N
   días.», sin código, nombre ni enlace del indicador. El Admin SGC no recibe el escalamiento, y AIN no tiene líder que
   reciba el aviso por proceso.
2. **Crear una ficha «Porcentaje» (§24.1; `coordinadora.sgc`).** **Indicadores** → **Nuevo indicador** → **¿Cómo se
   calcula?** **Porcentaje**, en el proceso SGC (sin líder: la aprobará Gerencia), mensual, ascendente, meta 90, con sus dos
   variables y sus fuentes, y sus **rangos del semáforo** (desde la entrega complementaria, una ficha nueva los escribe):
   **Bien ≥ 90**, **Atención ≥ 63** y **Crítico < 63**. El código propuesto es `SGC-ID-001` (la forma de los códigos del
   hospital; los `SGC-IND-NN` de la demo siguen valiendo). En **Quién mide**
   elíjase usted (con «(el líder del proceso)» y un proceso sin líder, los cargos responsables quedan vacíos: al guardar, el
   error abre **Más opciones** y sale junto a la lista de cargos, con el foco en ella); en **Más opciones**, **Inicio de
   medición** en enero, para el paso 6. **Así quedará el semáforo**: «Bien: ≥ 90 % · Atención: ≥ 63 % · Crítico: < 63 %».
   **Prueba** con 9 y 10: «Cumple: 90 % frente
   a una meta de 90 %.» y «Bien». **Guardar borrador** → en la página de edición, **Enviar a aprobación** con su clave: la
   ventana muestra la versión, el tipo («Ficha nueva») y la huella; la ficha queda **Por aprobar**.
3. **Fórmula libre (§24.2).** Otra ficha en SGC con **Fórmula libre** y tres variables. Escriba `max(A, B)`: debajo sale
   «Separe los argumentos con punto y coma»; `A ^ 2`, «Carácter no admitido: «^»»; `(A + B`, «Falta cerrar un
   paréntesis»; una letra sin declarar, al guardar, «La fórmula usa la variable D, que no está declarada», junto a la
   fórmula y con el foco en ella. Corríjala (por ejemplo `(A + B) ÷ C × 100`, con **En palabras** debajo), pruébela y
   envíela. Cree y envíe además **una tercera** ficha cualquiera en SGC: es la que se devuelve en el paso 4.
4. **Aprobar en bloque y devolver (§24.3; `gerente`).** **Mis tareas**: tres «Aprobar la ficha de SGC-ID-00…» y sus avisos
   «Ficha por aprobar: …». **Indicadores** → **Por aprobar · 3**: marque dos y **Aprobar las seleccionadas** con una sola
   clave («Se aprobaron 2 fichas.»); en la tercera, **Devolver** con una nota: la página lo confirma («Se devolvió la ficha
   de … a borrador, con su nota.»). `coordinadora.sgc` recibe «Devolvieron la ficha de …» con la nota y la tarea «Ficha
   devuelta: …». La demo no trae fichas por aprobar para `gerente`: la de `GTH-IND-02` es de `lider.gth`.
5. **Ficha impresa (§24.4).** En `SGC-IND-01`, **Imprimir ficha** (y **Imprimir**, o guardar como PDF): encabezado con el
   logo, «Ficha técnica de indicador», código, versión y fecha; **Identificación** y **Estructura de medición** (fórmula y
   rangos en palabras); **Firmas** reales («Elaboró» María Fernanda Perdomo, Líder de Calidad; «Revisó y aprobó» Gerente
   de ejemplo, con su fecha); **Control de cambios**; **Datos de operación**; **Seguimiento y medición** (primer trimestre
   5/5 = 100 % y segundo 5/6 = 83,3 %, históricos; tercero 3/5 = 60 % Crítico con causa y acción; el cuarto por venir; el
   acumulado 13/16 = 81,3 %); y la **Representación gráfica** con el valor y el estado escritos. Compárela con la hoja
   IND-01 del Excel del usuario: por diseño las firmas van después de la estructura, hay una fila por periodo (no doce
   meses) y no lleva NIT ni «Página 1 de 1».
6. **Históricos (§24.5).** En la ficha aprobada en el paso 4 (con inicio en enero), **Registrar históricos de 2026**: llene
   algunos meses, marque **No aplica** con motivo en uno y **Guardar los históricos**. Quedan marcados «Histórico», con su
   color, sin tareas ni alertas (ni siquiera un crítico); los que no llene siguen «Por registrar».
7. **Reportar sin ser líder, Crítico y Atención, soportes (§24.6, §24.7 y §24.20; `jefe.urgencias`, a 390 px y solo con el
   teclado).** Desde su tarea, la pantalla **Reportar** de septiembre. En **Soportes**, intente un `.xls` o un Word: «El
   soporte debe ser PDF, imagen (PNG, JPG, WebP) o Excel (.xlsx)»; un `.xlsx` y un PDF entran. Digite 2000 y 40: al
   instante «50 min», «Crítico» y «No cumple: 50 min frente a una meta de máximo 30 min.»; como sube más de 30 % frente a
   agosto, pide **Sí, los datos son correctos**. **Reportar**: la página del indicador se abre con el foco en la sección
   **Análisis**, que pide **Causa de la desviación** y **Acción propuesta**, y la medición queda «Requiere acción de
   mejora». La alerta del crítico les llega a `coordinadora.sgc` y a `admin` (AIN no tiene líder; a quien reporta no le
   llega). Luego **Corregir** octubre con 1520 y 40 (38 min): **Atención**, y la pantalla avisa que el análisis será
   obligatorio; pero agosto (Atención), septiembre (Crítico) y octubre quedan tres periodos seguidos sin cumplir, el umbral
   del incumplimiento repetido (spec §13.8), así que al guardar pide también **Causa de la desviación** y **Acción
   propuesta**, la medición queda «Requiere acción de mejora» («El resultado no cumple por varios periodos seguidos») y
   `coordinadora.sgc` y `admin` reciben «… Atención con 3 periodos sin cumplir. Octubre de 2026». Una Atención sin esa
   racha pide solo el análisis; un periodo en Bien (por ejemplo 1080 y 40) no pide nada.
8. **«No aplica» no es «Sin dato» (§24.8).** `SGC-IND-08`, tercer trimestre: «n. a.», gris, «Reportada», con su motivo y
   sin análisis; `AIN-IND-01`, julio: «s. d.» en la gráfica y la matriz, y en la tabla del año «— · Sin dato · Cerrada»
   (el cierre lo dejó sin datos; «Sin dato: no se midió.» es la fila de un periodo que no tiene medición). Ninguno entra
   al acumulado. El «No aplica» que usted marcó en el paso 6 tampoco. (En una medición ordinaria, **No aplica en este
   periodo** en la pantalla de reporte y **Quitar «No aplica»** para deshacerlo.)
9. **La página del indicador (§24.9).** `AIN-IND-01` → **Resultados**: el último resultado con su frase y su comparación
   con el periodo anterior (la flecha, la diferencia en minutos y «mejora» o «empeora»: aquí bajar es mejorar), la gráfica
   de tubos con **el hueco de julio**, la línea de la meta y la punteada del límite, el **Acumulado del año** (después del
   paso 7, «Acumulado parcial: falta julio»), **Sus variables** y la tabla del año. Pase el cursor
   por una columna, enfóquela con **Tab** y tóquela en el celular: la tarjeta dice periodo, valor, estado y meta.
   **Ver:** 2 años y Todo.
10. **Metas por periodo (§24.10; `coordinadora.sgc`).** `AIN-IND-01` → **Administrar** → **Programar metas**: diciembre
    (aún no termina) se cambia sin más («Meta guardada.») a una meta dentro de su Bien (≤ 30 min, por ejemplo 28; con 35,
    «La meta debe quedar dentro del rango de Bien»); octubre (terminado y sin cerrar) pide **Justificación**, queda
    marcado «Meta ajustada después del periodo» y se recalcula (si cambia el color, avisa como una corrección).
11. **Observaciones y lo que no ve Consulta (§24.11).** Como `control.interno`, `AIN-IND-01` → **Observaciones** → periodo
    septiembre → **Dejar la observación**. `jefe.urgencias` recibe «Observación en AIN-IND-01» y la tarea «Responder la
    observación de Control Interno de ejemplo en AIN-IND-01»; **Responder** → `control.interno` recibe «Respuesta a su
    observación en AIN-IND-01». Como `consulta` (asignada a AIN, sin designación): ve `AIN-IND-01`, su resultado y su
    análisis, pero no la pestaña **Observaciones** ni la columna **Soportes**. `coordinadora.sgc` puede responder también la
    observación sembrada en `SGC-IND-01`.
12. **Matriz y Excel (§24.12).** **Matriz del año** con **Proceso** AIN y con todos: celdas con valor, franja y figura por
    estado, «s. d.» en julio, la columna **Año**; **Imprimir** y **Excel** (incluye retirados). En la lista, **Excel** con
    los filtros puestos; en `SGC-IND-01`, **Excel** (hojas «Ficha» y «Resultados 2026»). Cada descarga queda en la
    **Bitácora**.
13. **Cierre del mes y reapertura (§24.13; `coordinadora.sgc`).** **Cierre del mes** → **Cerrar hasta** septiembre → **Ver
    el resumen**: cuántas se cerrarán, las reportadas, las que quedarán sin dato y quién debía medirlas, las «no aplica»,
    las que no tienen análisis, **Por proceso**, las observaciones sin respuesta (no lo impiden) y **No se cierran** (los
    históricos sin registrar del paso 6). Con la demo, después del paso 7 no queda nada sin dato ni sin análisis
    (septiembre de AIN, la única medición por reportar, ya se reportó y se analizó; los Bien sin alcanzar la meta de
    `SGC-IND-06` y `CNT-ID-001` traen su análisis desde la siembra): esas secciones salen en cero
    («Ninguna medición quedará sin dato.»); para ver «quién debía medirlas», mire el resumen antes del paso 7, sin
    cerrar. **Cerrar septiembre de 2026** → **Cerrar el mes**, sin clave. Como `jefe.urgencias`, septiembre ya no tiene
    **Corregir** y su pantalla de reporte dice «La medición está cerrada: pida al Administrador del SGC que la reabra.».
    Como `coordinadora.sgc`, **Reabrir** septiembre con su justificación (`jefe.urgencias` recibe «Medición reabierta en
    AIN-IND-01»), corrija como `jefe.urgencias`, vea **Corregida** con **Ver el historial** (qué había, qué quedó, quién,
    cuándo y por qué) y **Cerrar de nuevo**. `CEX-IND-01` julio trae ya un ejemplo.
14. **Cambio mayor y menor (§24.14).** `SGC-IND-05` → **Versiones** ya muestra los dos. Hágalo usted en `SGC-IND-02`:
    **Administrar** → **Editar ficha** → **Abrir un cambio**, meta 80 → 85, **Motivo del cambio**, **Guardar borrador** →
    **Enviar a aprobación** («Cambio mayor», **Rige desde** el cuarto trimestre) → `gerente` lo aprueba: versión 2, y el
    tercer trimestre conserva la versión 1. Después **Abrir un cambio**, corrija una tilde o una letra del nombre y
    **Publicar el cambio menor** con su clave: versión 3, «No requiere: cambio menor». El **Control de cambios** muestra las
    dos.
15. **Restringido (§24.15).** `GTH-IND-01` es restringido: como `consulta`, no está en la lista, ni en `Ctrl K` («rotación»)
    ni en la matriz, y `/indicadores/GTH-IND-01` dice «Página no encontrada»; como `lider.gth` (asignado a GTH), sí. Para
    marcar uno usted: `coordinadora.sgc`, `CEX-IND-01` → **Administrar** → **Datos de operación** → **Nivel de acceso**
    Restringido: `jefe.urgencias` (Consulta, solo AIN) deja de encontrarlo y `consulta` (asignada a CEX) lo sigue viendo.
    Devuélvalo a General.
16. **Regulatorio y normograma (§24.16).** `CEX-IND-01` → **Ficha técnica**: clasificación Regulatorio, **Normas que lo
    exigen** «Resolución 256 de 2016» y **Se reporta a**. **Normograma** → Resolución 256 de 2016 → **Indicadores que
    exige**: `CEX-IND-01`.
17. **Retirar, duplicar y descartar (§24.18; `coordinadora.sgc`).** Retire `SGC-IND-07` con motivo: «Retirado el … por …»
    con el motivo, sus designados (aquí, la propia `coordinadora.sgc`) reciben «Retiraron el indicador SGC-IND-07», sale
    de la lista (vuelve con **Incluir retirados**) y en la búsqueda sale marcado «Retirado». **Crear a partir de este** en
    otro: un borrador nuevo con el contenido y el código propuesto. La ficha devuelta en el paso 4 → **Administrar** →
    **Descartar** con motivo: «Descartado el …» y «Solo lo ve quien administra y su código sigue ocupado.»; un indicador
    nuevo en SGC recibe el número siguiente.
18. **La ficha guarda los nombres firmados (§24.19).** **Estructura** → renombre el cargo «Líder de Calidad»: la ficha de
    `SGC-IND-01` (y su firma «Elaboró») sigue diciendo «Líder de Calidad». Devuélvale el nombre.
19. **Lo que cambió con la ola final (F14A-R51 a R53; `coordinadora.sgc`).** En **Normograma**, registre una norma
    nueva: su ficha ofrece **Borrar…**. Cítela en un **Nuevo indicador** (**Normas que lo exigen**) y guárdelo como
    borrador: la ficha de la norma ya solo ofrece **Retirar…** (antes, borrarla daba un error en inglés). En `AIN-IND-01` →
    **Administrar** → **Datos de operación**, suba el plazo de reporte hasta que la fecha límite de septiembre quede en el
    futuro: el periodo deja de estar **Vencido** y su aviso de vencido se volverá a mandar cuando venza. En `SGC-IND-01`
    → **Resultados**, el valor bajo cada tubo lleva su unidad («100 %», «83,3 %», «60 %»), y a 390 px la gráfica arranca
    con columnas enteras (ningún valor partido). Si corrige o reporta tarde un periodo que cambia de color, la marca «N
    periodos sin cumplir» de los siguientes que siguen abiertos se pone o se quita. En un indicador con periodos ya
    reportados y vencidos, marcar **Pedir un soporte** en **Datos de operación** no los reabre ni los vuelve vencidos: el
    soporte se pide desde ahora.
20. **Verificación técnica:** lint, `SEMILLA_RECIEN=1 npm test` y el build sin URL de base, hechos al cierre de la
    ola final; la imagen en un contenedor aparte, la `0011` sobre una copia de la base del usuario y este recorrido en el
    navegador, hechos por el controlador tras la ronda 1 (ver «Hecho (Fase 14A)»).

**Al terminar:** el recorrido avanza la demo (y cierra septiembre en la base), y `npm test` salta los casos que dependen de
ella, con un aviso en la salida. `npm run db:seed && npm run admin:asegurar` la deja como nueva.

### Avisos para el usuario (Fase 14A)

1. **La rama trabajó sobre una base aparte, `sgc_f14a`** (con su almacén `almacen-f14a`), en el worktree
   `F:\sgc-integral-f14a`, por decisión del usuario del 2026-11-10 («Worktree aparte»; precedente F13C-R20). **Su base `sgc`
   y su `next dev` no se tocaron.** La migración `0011` se aplicará a su base cuando arranque la app de la rama (o con
   `npm run db:preparar`): es aditiva y siembra los tres maestros (tipos, clasificaciones y unidades) y los cinco
   parámetros si están vacíos. Git no deja sacar la misma rama en dos carpetas a la vez: mientras exista el worktree, su
   carpeta no puede hacer `git switch fase-14a-indicadores`.
2. **Para ver la demo de la 14A en su base:** `npm run db:seed` (vacía la base y `./almacen`) y `npm run admin:asegurar`.
   Reinicie `npm run dev` antes, por la matriz de permisos nueva.
3. **La primera carga de página después de sembrar dispara la pasada de vencimientos** con el reloj real: aparecen el aviso
   de vencido de `AIN-IND-01` a `jefe.urgencias` y el escalamiento a `lider.cex`. Es el comportamiento normal. Para ver la
   demo «limpia», resiembre justo antes.
4. **Los periodos de la demo se mueven con el día de la siembra:** lo que terminó hace más que el plazo de reporte (10 días)
   ya está reportado y no siempre queda un periodo «por reportar» dentro de su plazo (sembrando el 2026-11-12, ninguno).
   Sembrando entre el 11 de octubre de 2026 y el 10 de enero de 2027, los trimestres sembrados son los tres primeros de 2026
   (`SGC-IND-01` como la maqueta); los meses de urgencias y consulta externa son de mayo a octubre, como en el recorrido,
   solo sembrando entre el 11 de noviembre y el 10 de diciembre de 2026; fuera de esas fechas se corren con el día.
5. **El Excel `INDICADORES_PROCESO_SGC_OK.xlsx` sigue fuera del repositorio** (en la raíz, excluido en
   `.git/info/exclude`): la semilla tomó de él el nombre, el objetivo, la fórmula, las variables con su fuente, la meta y la
   periodicidad de las ocho fichas, sin copiarlo.
6. **Decida usted una regla que el spec dejó abierta** (F14A-R15): un cambio mayor que pasa a una periodicidad más gruesa a
   mitad de periodo no puede regir hasta que empiece el siguiente periodo sin reportes; el diálogo lo dice. Si la Fase 16
   necesita otra regla (vigencia en fecha futura), se propone entonces.
7. **`diaLocal` (`src/lib/tramites/plazos.ts`) guarda ahora su formateador de fechas por zona** (F14A-R29): es un caché de
   módulo que comparten los trámites y los indicadores, sin cambio de comportamiento; lo pidió el cierre del mes, que
   recorre todos los indicadores activos.
8. **Las tareas de indicadores las calcula «Mis tareas» sin escribir** (F14A-R2): una tarea de un periodo que acaba de
   terminar aparece cuando la revisión de vencimientos o una página del módulo abre ese periodo, a lo sumo una carga
   después.
9. **Los soportes `.xlsx` se validan sobre el archivo completo** (F14A-R26): el riesgo del ZIP renombrado que el spec
   aceptaba (§8.2 y §21) queda cerrado en los soportes. Hasta la ronda 1 la validación rompía en la app empaquetada y
   rechazaba todo `.xlsx` con un error 500 (D-1, ya corregido: F14A-R41). Queda una posibilidad sin reproducir: que un
   Excel legítimo con una hoja muy grande, escrito por algunos programas, no se reconozca (ver Deuda técnica); se guarda
   de nuevo con Excel o como PDF.
10. **En su base, después de traer la rama, corra `npm run db:preparar` antes de `npm run dev`**: aplica la migración
    `0011` y deja el rol `sgc_app` con sus privilegios, entre ellos el `REVOKE` nuevo de `cierres_indicadores` (ola final,
    M1). `npm run dev` no lo hace solo; la imagen de Docker sí, al arrancar (`arrancar.js`). Sin él, la prueba
    `tests/privilegios-bd.test.ts` falla en esa base.

## Qué probar y cómo (Fase 13C)

Recorrido de §19 del spec de la fase
(`docs/superpowers/specs/2026-11-08-fase13c-vigencia-externos-normograma-design.md`), adaptado a la demo que la semilla
deja de verdad (`src/db/semillas/vigencia-demo.ts`) y a las resoluciones de la ejecución (F13C-R40 y R41). El capítulo 7 del
manual (`docs/manual/usuario/07-vigencia-revision-anual-externos-y-normograma.md`) explica cada pantalla por actor. **No lo
ha recorrido todavía el usuario**; el controlador lo recorre en el navegador sobre una base aparte (claro, oscuro y
390 px) y deja sus capturas en la bitácora de la sesión.

0. **Preparar.** Base arriba, **reinicie `npm run dev`** (uno arrancado antes de la 13C sirve la matriz de permisos vieja)
   y **resiembre**: la base de desarrollo no se resembró en la fase y no tiene la demo de la 13C
   (`npm run db:seed && npm run admin:asegurar`; vacía la base y `./almacen`, y `admin` vuelve a pedir el cambio de
   clave). Abra `http://localhost:3002` (**no use 9081**: el compose no monta el almacén). Use ventanas privadas para tener
   varias sesiones; para el celular, `DEV_ORIGENES` como en la 13B (paso 0 de «Qué probar y cómo (Fase 13B)»).

   | Usuario | Clave | Papel en el recorrido |
   |---|---|---|
   | `coordinadora.sgc` | `Demo-SGC-2026-clave` | Administrador del SGC: semáforo, carga inicial, normograma, revisión anual; decide por AIN (sin líder) |
   | `gerente` | ídem | Ratifica los estratégicos (`SGC-MN-01`); lee todo, el informe y los indicadores |
   | `control.interno` | ídem | Lee todo en solo lectura |
   | `lider.gth` | ídem | Líder de GTH; responsable técnico de `GTH-DE-01` |
   | `lider.cex` | ídem | Líder de CEX; responsable técnico de `CEX-DE-01` |
   | `consulta` | ídem | Procesos AIN y CEX; será responsable técnico del externo del paso 3 |
   | `regente.farmacia` | ídem | Responsable técnico de `ATE-DE-01` y del punto Farmacia |
   | `jefe.urgencias` | ídem | Responsable del punto Urgencias, con su hallazgo abierto |
   | `admin` | La `ADMIN_CLAVE` de `.env.local` | Segundo Admin SGC, sin cargo: recibe el acuse de la lista «todos» (paso 10) |

   Lo que la demo trae (todas las fechas son relativas al día de la siembra): **34 vigentes** (30 internos y 4 externos).
   Semáforo: **3 vencidas** (`GTH-PR-01`, aprobado fuera hace 450 días; `AIN-FO-01`, hace 420; el externo `ATE-DE-01`,
   adoptado hace 520 días y nunca verificado), **1 en atención** (`SGC-PR-01`, fijada a 83 días por `coordinadora.sgc` con
   la nota «Carga inicial: …»), **4 en trámite** (`GTH-PR-02` SOL-…-002, `GBS-PR-01` SOL-…-003, `CEX-GU-01` SOL-…-005 y
   `CEX-CA-01` SOL-…-006) y 26 al día. La carga inicial dejó 24 internos con fecha fijada en cuatro grupos (120, 180, 240 y
   300 días) más `SGC-PR-01`: 25 «Fijada por María Fernanda Perdomo». Dos ratificaciones: `CEX-CA-01` (`lider.cex`, hace
   unos 8 meses) y `GTH-FO-01` (`lider.gth`, hace unos 4). Externos: `CEX-DE-01` (guía de hipertensión, ed. 2017, al día),
   `ATE-DE-01` (manual de la bomba de infusión, rev. 4.2, **vencido**, con una copia controlada recibida en Farmacia),
   `SOG-DE-01` (Resolución 3100 de 2019, texto de trabajo, con una edición obsoleta) y `GTH-DE-01` (estándares del
   SG-SST). Normograma: doce normas reales con requisito por proceso; la 3100 **deroga** a la Resolución 2003 de 2014 (hace
   9 días), con un impacto **pendiente** sobre `CEX-GU-01` en Consulta Externa (vence unos 6 días después de sembrar) y uno
   de proceso en SOG resuelto «no afecta». **Revisión anual del año abierta hace 7 días** (plazo 60, ventana 6): GTH con
   todo decidido y el normograma confirmado, **salvo `GTH-PR-01`**; CEX a medias (`CEX-CA-01` «Actualizar» con SOL-…-006,
   `CEX-GU-01` en trámite, `CEX-DE-01` y el normograma por decidir); AIN sin líder con `AIN-PR-01`, `AIN-FO-01` y
   `AIN-PT-01` por decidir; los demás pendientes. El informe se imprime sobre `SGC-FO-07` «Informe de revisión anual de
   documentos» (un formato ficticio de la semilla, ya elegido). «Todo el hospital» tiene un solo miembro: **todos los
   usuarios activos**. Indicadores: «Externos verificados al día» 3 de 4 (75 %, no cumple) y 3 documentos vencidos.

1. **Semáforo (`coordinadora.sgc`).** **Vigencia** → **Semáforo**: las tarjetas (3, 1, 26 y 4) y la lista con «Vencida hace
   N días», «Vence en 83 días» (`SGC-PR-01`, con «Fijada por …»), «Al día» y «En trámite · …». Filtre **Vencidas** con
   **Origen: Internos**: quedan los dos de la carga inicial (`GTH-PR-01` y `AIN-FO-01`; `ATE-DE-01` es externo y no admite
   fecha fijada). **Fijar próxima revisión a los 2 documentos filtrados** con fecha y nota: cada uno dice «Fijada por … el
   …» y la **Bitácora** tiene una fila por documento («Fijó la próxima revisión de … para el …»). **Devuelva los dos** al
   estado anterior: en la ficha de `GTH-PR-01` y en la de `AIN-FO-01`, **Vigencia** → **Ajustar** → **Quitar la fecha
   fijada** (vuelven a «Vencida»: los pasos 2, 6, 8 y 9 los necesitan así). **Descargar Excel** baja lo filtrado. La
   campana no trae avisos de vencimiento de la siembra: los genera la pasada de vencimientos al usar el sistema (cada
   diez minutos como mucho; paso 11).
2. **Ratificar (`lider.gth`).** En la ficha de `GTH-PR-01` (vencido), **Ratificar sin cambios** con nota y clave: la ficha
   dice «Ratificado el … por …», la próxima revisión queda a 12 meses y, como el documento está en la revisión abierta, su
   decisión queda «Ratificado» y GTH completo («Revisar los documentos de Gestión del Talento Humano (1 pendiente)»
   desaparece). Con una clave errada, «Clave o código incorrectos». `GTH-PR-02` (SOL-…-002 abierta) no tiene el botón. El
   Listado Maestro con la **Última revisión** nueva se mira como `coordinadora.sgc` (al líder el Maestro le dice «Sin
   acceso», heredado). Como `gerente`, `SGC-MN-01` (Manual de Calidad, estratégico) sí trae **Ratificar sin cambios**;
   `GTH-PR-02` (operativo) no.
3. **Externo nuevo (`lider.cex`).** **Vigencia** → **Externos** → **Registrar documento externo**: una guía del
   Ministerio de Salud y Protección Social en Consulta Externa, edición «2021», responsable técnico `consulta` → en la
   página del externo, suba el PDF y **Adoptar esta edición** con clave, sin marcar «Pedir acuse de lectura a la audiencia».
   Debe verse `CEX-DE-02` vigente; su ficha con el bloque **Documento externo**, sin **Solicitar cambio** y **sin acuses**
   (es un alta); en el Maestro (`coordinadora.sgc`) «Externo», edición «2021» y «Adoptado»; en la revisión abierta entra
   como «Revisado recientemente». Como `coordinadora.sgc`, **Pedir acuse de lectura** desde la ficha sí los crea. Apague
   **Publicación directa** en **Configuración documental**: **Registrar documento externo** sigue en **Externos** y en
   **Gestión de documentos**. Vuelva a encenderla.
4. **Verificación (`regente.farmacia`, en el celular o a 390 px).** **Mis tareas** → «Verificar la vigencia de ATE-DE-01 ·
   Manual de usuario de la bomba de infusión volumétrica» (vencida): fuente, **Hay una edición nueva**, nota →
   **Registrar verificación**. ATE no tiene líder: el aviso y la tarea «Adoptar la edición nueva de ATE-DE-01» llegan a
   los Admin SGC (`coordinadora.sgc` y `admin`); `coordinadora.sgc`, en la página del externo abre **Adoptar edición nueva** (edición «rev. 5.0» y «qué cambió»), sube
   el PDF y **Adoptar esta edición** con clave (la casilla del acuse viene marcada y fija): la rev. 4.2 queda obsoleta con
   banda, la copia de Farmacia pasa a «Por recoger» (tarea de recogida para `regente.farmacia`) y la audiencia recibe el
   acuse con «qué cambió» (la ficha dice «Acuses v2: 0 de 1 (0 %) · vencen el …»). Como `consulta` (responsable solo de
   `CEX-DE-02`), su pestaña **Externos** lista solo ese, y la página de `ATE-DE-01` le dice «Página no encontrada».
5. **Retiro (`lider.gth`).** En `GTH-DE-01` (**Externos**, del que es responsable técnico), verificación **Fue retirado o
   derogado** → **Registrar verificación y retirar**: queda anulado, fuera del portal y de la búsqueda, y la audiencia
   recibe «… dejó de aplicar: el documento externo fue retirado». (El otro camino: sección **Retiro**, **Motivo** y
   **Retirar**, sin clave.)
6. **Normograma (`coordinadora.sgc`).** **Normograma** → **Nueva norma** (una resolución nueva) → en su ficha **Registrar
   relación** → **Deroga a** → Resolución 1995 de 1999 (enlazada a `AIN-PR-01` y `AIN-FO-01`, asociada a AIN y GDO). Debe
   verse: la 1995 «Derogada · <fecha>» con el cambio en **Estado e historial**; los dos documentos con «Revisión por cambio
   normativo · Resolución 1995 de 1999» en la ficha (`AIN-PR-01` pasa a «Atención · revisión por cambio normativo»;
   `AIN-FO-01`, devuelto a vencido en el paso 1, sigue «Vencida» y lleva la marca en la fila **Cambio normativo** de su
   bloque **Vigencia**); y en **Mis
   tareas** de `coordinadora.sgc` (AIN y GDO no tienen líder) «Revisar el impacto de Resolución 1995 de 1999 (derogada) en
   Atención Inmediata (2)» y la de Gestión Documental (impacto de proceso). Resuelva: en `AIN-PR-01` **Abrir solicitud de
   cambio** (llega con el motivo «Cambio normativo» y la nota del impacto; enviada, el impacto queda resuelto, el trámite
   dice «Abierto por el cambio de Resolución 1995 de 1999» y la decisión de `AIN-PR-01` en la revisión queda «Actualizar»);
   en `AIN-FO-01` **No afecta…** con nota. Como `consulta`, el normograma y la ficha de la 3100: ve todo menos el enlace a
   `GTH-FO-01` (restringido), que ni se nombra ni se cuenta. Como `lider.gth`, en la página de GTH **Normas aplicables** →
   **Asociar norma** con un requisito.
7. **Revisión anual, líder (`lider.cex`).** **Mis tareas** → «Revisar los documentos de Consulta Externa (2 pendientes)»
   (`CEX-DE-01` y el normograma): la tabla con los insumos; `CEX-CA-01` «Actualizar» con SOL-…-006 en curso, sin botones
   mientras el trámite vive (esa solicitud dice «Abierto desde la revisión anual 2026», motivo «Revisión anual»);
   `CEX-GU-01` «En trámite» con SOL-…-005; `CEX-DE-01` → **Ratificar** (verificación «sigue vigente», sin clave, con la
   fuente) y vuelve a la tabla. Confirme el normograma **Sin novedad**: la tarea desaparece. Fuera de la tabla, la tarea
   «Revisar el impacto de Resolución 2003 de 2014 (derogada) en Consulta Externa (1)»: **Enlazar el trámite en curso
   SOL-…-005** o **No afecta…**. El ejercicio «ratificar uno, actualizar otro, eliminar otro» va en el paso 8, sobre AIN
   (F13C-R40).
8. **Revisión anual, Admin (`coordinadora.sgc`).** **Vigencia** → **Revisión anual**: el avance por proceso (GTH y CEX
   «Completo», AIN «Sin líder»); **Prorrogar…** 15 días con motivo: el aviso «La revisión anual 2026 se prorrogó hasta el …»
   va a los responsables de los procesos con pendientes, menos a quien prorroga; a esta altura ya no quedan líderes con
   pendientes, así que en la demo lo recibe solo `admin`, por los procesos sin líder. Con una abierta no hay botón para
   abrir otra. Pulse Atención Inmediata y decida uno de cada: `AIN-PR-01` ya está «Actualizar» con la solicitud del paso 6
   (si no la abrió, **Actualizar** desde aquí); ratifique `AIN-PT-01` (**Ratificar sin cambios**, con clave) y **Eliminar**
   `AIN-FO-01` (la solicitud llega prellenada con «Decisión de la revisión anual 2026: el documento debe eliminarse.» y el
   trámite dice «Abierto desde la revisión anual 2026»; `AIN-FO-01` queda en trámite, y vencido por su fecha, para el paso
   9). **Cerrar y generar informe** con clave: lo pendiente queda «Sin revisar». **Informe 2026 en PDF**:
   sale sobre `SGC-FO-07` («INFORME DE REVISIÓN ANUAL») con las cifras, la tabla de decisiones con su estado al cierre, los
   cambios normativos del año, el normograma por proceso, los otros insumos y la firma; abrirlo otra vez da el mismo
   archivo. Como `gerente`, la revisión cerrada y el informe; como `lider.gth`, la página de la revisión con GTH y sin el
   PDF. En **Configuración documental** → **Vigencia**, **Ver informe de ejemplo**. **Cerrar deja la revisión del año
   cerrada e inmutable** en la base de desarrollo: para repetir el recorrido, resiembre.
9. **Indicadores (`gerente`).** **Vigencia** → **Indicadores**: las siete tarjetas con meta y «cumple», «no cumple» o «sin
   dato», y la octava de trámites. Seguido en orden, el único vencido que queda es `AIN-FO-01`, con su solicitud de
   eliminación del paso 8: «Documentos con revisión vencida» marca 1, con «1 en trámite» (cuenta por la fecha, F13C-R28), y
   no cumple la meta de 0; el gráfico de vencidos por proceso muestra AIN; y debajo, en lugar del enlace «Ver los N vencidos
   en el Semáforo» (que cuenta solo los que el Semáforo pinta «Vencida»), dice «1 vencido está en trámite: el Semáforo lo
   muestra en «En trámite».». Con la demo recién sembrada el enlace sí sale: «Ver los 3 vencidos en el Semáforo». La tabla
   por proceso y el Excel (tres hojas). Como `lider.gth`, solo GTH. En **Configuración documental** → **Indicadores
   documentales**, suba «Documentos vencidos (máximo)» a 1: la tarjeta pasa a «cumple» y cambia de color; devuélvala a 0.
10. **Herencia de la 13B.** **Distribución** → **Socializaciones** → **Descargar Excel**: con nombres para `gerente` y
    «Reservada» para `lider.cex` en la jornada de GTH. Como `coordinadora.sgc`, verifique Farmacia («Toca verificar») con un
    ítem no conforme y, en el diálogo de **Cerrar verificación**, cambie la fecha de corrección: el hallazgo vence ese día.
    Como `gerente`, **Puntos de uso** y **Listas de distribución** sin botones ni formularios (las altas, «Página no
    encontrada»). En `SGC-PR-01` → **Editar datos** → **Distribución**, marque «Todo el hospital» (miembro «todos») y pida
    el acuse: `admin`, sin cargo, también recibe la tarea. Como `jefe.urgencias`, **Corregido** con nota (y foto, si quiere)
    en el hallazgo de Urgencias: pasa a «Por validar» y la tarea «Validar la corrección del hallazgo en Urgencias» llega a
    los Admin SGC. Como `coordinadora.sgc`, **Reabrir…** con nota (vuelve a `jefe.urgencias` con fecha nueva y «Se reabrió 1
    vez»); `jefe.urgencias` lo marca **Corregido** otra vez y `coordinadora.sgc` verifica Urgencias conforme (el diálogo avisa
    «Este punto tiene 1 hallazgo por validar…»): el hallazgo queda «Validado por la verificación del …» y la verificación
    dice «Validó 1 hallazgo por validar.». El aviso «Se emitió N copia(s) de la versión vigente» de **Reemplazar** se ve (por
    ejemplo en `ATE-DE-01` tras el paso 4, o con `GBS-PR-01` como en la 13B), y en **Copias controladas** los conteos del
    líder incluyen las copias que emitió en puntos de otros procesos.
11. **Vencimientos.** La revisión de vencimientos corre al usar el SGC, cada diez minutos como mucho. Con la demo recién
    sembrada (paso 1) avisa por el externo vencido `ATE-DE-01`: a `regente.farmacia`, con su nombre («ATE-DE-01 · Manual de
    usuario de la bomba de infusión volumétrica: la verificación de vigencia venció hace N días»), y a los Admin SGC,
    agrupado y sin códigos («1 documento externo con la verificación de vigencia vencida en Apoyo Terapéutico»). No avisa
    por `GTH-PR-01` ni por `AIN-FO-01`: están vencidos, pero dentro de la revisión abierta (F13C-DC6). El escalamiento al jefe
    no se ve en la demo: nadie tiene el cargo superior del regente (Subgerente Científico). Seguido en orden, después del
    paso 8 no queda ningún interno vencido fuera de un trámite (`GTH-PR-01` se ratificó y `AIN-FO-01` tiene su solicitud de
    eliminación) ni ningún externo vencido: el aviso agrupado «N documentos con revisión vencida en …» y el del jefe sin
    títulos no tienen de qué salir con la demo, y los cubre `tests/vigencia-vencimientos.test.ts`. Bajar «Plazo para
    responder un impacto normativo» solo cambia los impactos que nazcan después: los ya creados guardan su vencimiento.
12. **Verificación técnica:** hecha al cierre (ver «Hecho (Fase 13C)»), con **once** migraciones (0000 a 0010), no nueve como
    dice el spec §19.12 (la 0009 y la 0010 nacieron en la ejecución: F13C-R2, R3 y R10).

**Al terminar:** el recorrido avanza la demo y cierra la revisión del año, y `npm test` salta los casos que dependen de ella,
con un aviso en la salida. `npm run db:seed && npm run admin:asegurar` la deja como nueva.

### Avisos para el usuario (Fase 13C)

1. **Reinicie `npm run dev` antes del recorrido.** Un servidor de desarrollo arrancado antes de la 13C sirve la matriz de
   permisos vieja: sin reiniciarlo, Vigencia, el normograma y los permisos nuevos fallan o no aparecen.
2. **La base de desarrollo no se resembró** (el spec §17 decía resembrarla; F13C-R20). La demo nueva, los tests con
   `SEMILLA_RECIEN=1`, los ensayos de migración y los recorridos se hicieron en una base aparte (`sgc_f13c`, con su almacén
   aparte). Su base de desarrollo tiene las migraciones 0008 a 0010, la demo de la 13B y los datos de prueba de los puntos
   de control de las Tareas 4 a 9 (ratificaciones de `AIN-FO-01` y `GTH-PR-01`, fechas fijadas en GTH, un externo
   `CEX-DE-01` con dos ediciones, las normas Resolución 2003 de 2014 y 3100 de 2019 con una derogación). Para ver la demo de
   la 13C: `npm run db:seed && npm run admin:asegurar` (borra la base de desarrollo y `./almacen`).
3. **Una base real amanece con muchos vencidos tras la migración.** Lo cargado como ya aprobado cuenta desde su **fecha de
   aprobación** (F13C-DC31): todo lo aprobado hace más de 12 meses sale «Vencida» el primer día, con tareas para los líderes
   y avisos. Trátelo con fechas fijadas en masa y escalonadas por proceso desde el Semáforo, con su nota, y abriendo la
   primera revisión anual al terminar la carga (manual, capítulo 7, sección 6.1). Base: Práctica.
4. **Una revisión anual cerrada no se reabre ni se borra** (trigger), y su año queda usado. En una instalación real, no
   cierre una revisión de prueba. **Los insumos se congelan al cierre** (F13C-R16): el informe dice lo que había ese día,
   aunque los documentos cambien después. Base: ISO 7.5.3.1 b).
5. **El informe de la revisión anual se imprime sobre el formato elegido** en **Configuración documental** → **Vigencia** →
   **Documento del formato del informe** y, si no hay, sobre el del acta. En la instalación real registre el formato propio
   (con el código SGC-RG-06 si lo quiere en el encabezado) y elíjalo **antes del primer cierre**: después el informe ya no
   cambia. Base: Práctica (F13C-DC16).
6. **La migración imprime tres avisos** (NOTICE 42622) de nombres de restricción truncados a 63 caracteres: son
   inofensivos.
7. **Verificar un externo desde la tabla de la revisión anual no resuelve su impacto normativo pendiente** (F13C-R25): el
   impacto se resuelve desde su página (el enlace de su tarea o de la marca del documento).
8. **El cierre de hallazgos es en dos pasos** y la siguiente verificación del punto valida o reabre los que estén por
   validar: el diálogo de cierre lo avisa. **La fecha de corrección se elige al cerrar la verificación**, en ese diálogo, y
   no se guarda con el avance (F13C-R36).
9. **Las tareas se agrupan pasadas cinco** solo para acuses, documentos por revisar y externos por verificar. Las de
   impactos, adopciones y la revisión anual no, y **no hay una lista de impactos pendientes**: cada impacto se atiende desde
   el enlace de su tarea (F13C-R39).
10. **Los textos de la Configuración documental ya dicen lo que hace el código** (corrección final): las ayudas de
    «Ventana de la revisión anual (meses)», «Aviso antes del vencimiento de la revisión (días)» y «Días de aprobación
    (máximo)», y la opción «Sin formato propio: el del acta» de **Documento del formato del informe**.

## Qué probar y cómo (Fase 13B)

Recorrido de §18 del spec de la fase
(`docs/superpowers/specs/2026-11-07-fase13b-distribucion-puntos-de-uso-design.md`). El capítulo 6 del
manual (`docs/manual/usuario/06-distribucion-copias-controladas-acuses-y-puntos-de-uso.md`)
explica cada pantalla por actor. **No lo ha recorrido todavía el usuario**; el controlador lo
recorre en el navegador tras el commit de cierre y deja sus capturas en la bitácora de la sesión.

> **Desde la 13C** este recorrido describe la demo de la 13B: tras resembrar, la demo es la de «Qué probar y cómo (Fase
> 13C)», el hallazgo se cierra en dos pasos («Corregido» y la validación), «Todo el hospital» es «Todos los usuarios
> activos» (llega también a `admin`) y **Socializaciones** tiene Excel.

0. **Preparar.** Base arriba y `npm run dev` → `http://localhost:3002` (**no use 9081**: el compose no monta el
   almacén y los PDF de la demo no existen allí; las copias controladas se generan desde el
   principal). La base quedó recién sembrada en la Tarea 15 de la fase; para empezar de cero:
   `npm run db:seed && npm run admin:asegurar`. Use ventanas privadas para tener varias sesiones.
   Antes de emitir, en **Entidad y marca** escriba **Dirección de la plataforma**
   (`http://localhost:3002` en desarrollo): sin ella el sello sale sin QR (paso 5).
   **Desde el celular:** `next dev` solo atiende bien a `localhost`; desde otro equipo la página carga con
   estilo pero el menú, la búsqueda y todo lo interactivo quedan muertos (el cliente de desarrollo no logra su
   WebSocket y recarga la página sin parar). Ponga en `.env.local` la IP del PC, `DEV_ORIGENES=192.168.20.104`
   (la que muestre `ipconfig`), reinicie `npm run dev` y abra `http://192.168.20.104:3002` en el celular; la
   **Dirección de la plataforma** debe ser esa misma, no `localhost`, para que el QR abra en el celular.

   | Usuario | Clave | Papel en el recorrido |
   |---|---|---|
   | `coordinadora.sgc` | `Demo-SGC-2026-clave` | Administrador del SGC; responsable del punto Archivo |
   | `lider.gth` | ídem | Líder de GTH; responsable del punto Talento Humano |
   | `jefe.urgencias` | ídem | **Nuevo.** Luz Dary Ortiz, Enfermera Jefe (rol Consulta, proceso AIN); responsable del punto Urgencias |
   | `regente.farmacia` | ídem | **Nuevo.** Carlos Andrés Rojas, Regente de Farmacia (rol Consulta, proceso ATE); responsable del punto Farmacia |
   | `consulta` | ídem | Procesos AIN y CEX (ahora tiene procesos); responsable de Laboratorio y Vacunación |
   | `gerente`, `control.interno` | ídem | Ven todo en solo lectura; `control.interno` tiene pendiente la lectura de `GTH-CA-01` v3 |
   | `lider.cex` | ídem | Líder de CEX; responsable de Odontología |

   Lo que la demo trae sembrado (spec §16): siete puntos de uso (Urgencias, Farmacia, Laboratorio,
   Vacunación, Odontología, Talento Humano, Archivo) y dos listas («Todo el hospital» y «Personal
   asistencial»); `GTH-CA-01` con la lista «Todo el hospital» y lectura obligatoria al ingresar;
   copias de `GTH-CA-01` v3 (Talento Humano recibida, Urgencias emitida hace 4 días y sin recibir,
   Vacunación anulada por error) y una copia de la v2 en Archivo **por recoger**; los acuses de la
   v3 (3 por firma, 2 individuales, 2 por asistencia y 1 pendiente vencido: `control.interno`); una
   jornada hace 5 días con cuatro asistentes y un acta PDF; Farmacia verificada y conforme hace 95
   días («Toca verificar») y Urgencias verificada hace 20 días con un hallazgo abierto y vencido
   («copia no controlada de AIN-FO-01»).

1. **Puntos de uso (`coordinadora.sgc`).** **Mapa de procesos** → proceso AIN → subproceso «Atención del Parto»
   → **Nuevo punto de uso para este subproceso**: el formulario llega con el nombre y el proceso AIN; cámbielo a
   «Sala de partos», con `jefe.urgencias` de responsable (también se crea desde **Administración** → **Puntos de
   uso** → **Nuevo punto de uso**). Debe verse en la lista. Abra **Urgencias** y desactívelo: lo impide, y la
   página lista las copias vivas que lo impiden (documento, número y estado) con enlace a cada una. En
   **Usuarios**, abra `jefe.urgencias`: **Desactivar usuario** lo impide mientras tenga puntos activos, con enlace
   a ellos.
2. **Emitir (`lider.gth`).** Abra `GTH-PR-01` → **Emitir copia controlada**: el diálogo pone primero los puntos de
   los procesos del documento (Talento Humano) y luego los demás activos. Elija Talento Humano. La app lleva a la
   página de la copia con «La copia está lista para imprimir»; pulse **Abrir el PDF para imprimir** (pestaña
   nueva): franja «COPIA CONTROLADA N.º 01 · GTH-PR-01 v1 · Talento Humano · Entregada a …» en cada página y el
   QR. La copia nace **Recibida** porque el líder es el responsable. Emita otra para **Urgencias** (N.º 02, queda
   «Sin recibido»): el líder emite los documentos de sus procesos a cualquier punto activo. Recargue el PDF: no
   genera una impresión nueva. Pasados 15 minutos, la página de la copia ya no ofrece **Abrir el PDF**, sino
   **Reimprimir** (pide motivo); el enlace viejo del PDF vuelve a la copia con «La ventana de impresión
   terminó…». En `GTH-FO-01` (restringido), emitir para Farmacia es rechazado: su responsable no lo ve. **La
   demo no trae ningún vigente con principal en Word:** registre uno (**Registrar documento ya aprobado**,
   principal `.docx`) y su ficha muestra **Emitir copia controlada** deshabilitado con «Para emitir copias
   controladas el archivo principal debe ser PDF».
3. **Recibido (`jefe.urgencias`).** **Mis tareas** → «Recibir la copia N.º 02 de GTH-CA-01 v3 en
   Urgencias» (la copia de la demo, emitida hace 4 días y vencida; si hizo el paso 2, también tiene la de
   `GTH-PR-01` v1) → **Confirmar el recibido**. La copia queda **Recibida**; en la página de la copia el historial dice quién y cuándo.
4. **Publicar y recoger.** Atajo con la demo: como `coordinadora.sgc`, emita copias de `GBS-PR-01` v1 para
   Urgencias y Farmacia y luego publique SOL-2026-003 (`GBS-PR-01` v2: **Publicar**, con clave). Debe verse:
   las dos copias de la v1 en **Por recoger**, la tarea «Recoger la copia …» para `jefe.urgencias` y
   `regente.farmacia`, y el botón **Reemplazar las copias de la v1 (2)** en la ficha. Púlselo: nacen dos
   copias de la v2; cada responsable confirma **Recibí esta y retiré la v1** con destino **Devuelta al
   SGC**. (El camino largo, con `GTH-PR-01`: pasos 1 a 5 de «Qué probar y cómo (Fase 13A)»; ahí marque
   **Requiere socialización** al aceptar, para el paso 8.)
5. **QR.** Abra `http://localhost:3002/documentos/GBS-PR-01?v=1` (lo que codifica el QR de la copia de la
   v1): la ficha dice «Esta copia es de la versión 1; la vigente es la 2». Con el celular en la red del
   hospital, el QR real abre lo mismo. Vacíe **Dirección de la plataforma**: el diálogo de emisión avisa «Sin
   dirección de la plataforma configurada, el sello saldrá sin código QR» (con enlace a **Entidad y marca**
   para el Admin SGC) y el sello sale sin QR. Como `consulta`, la ficha de `GTH-CA-01` muestra el bloque
   **Socialización** con la jornada de la demo («Jornada del … · reunión de servicio · … asistentes · acta
   adjunta»), sin enlace al acta.
6. **Acuse.** Como `control.interno`: **Mis tareas** → «Confirmar lectura de GTH-CA-01 v3» (vencida): trae
   «Qué cambió», «Le llega porque…»; el botón dice «Abra el documento para habilitar la confirmación» hasta
   abrir el documento; después marque la casilla y **Confirmar lectura**. Como `lider.gth`, la ficha de
   `GTH-CA-01` muestra «Acuses v3: … de …» y **Ver quién falta**. `gerente` ve el porcentaje de la entidad
   en **Distribución** → **Acuses de lectura**.
7. **Lista y pedido manual (`coordinadora.sgc`).** En **Gestión de documentos** → `SGC-PR-01` → **Editar
   datos** → **Distribución**, marque «Todo el hospital» y guarde; en la ficha despliegue **Pedir acuse de
   lectura…** y pulse el botón que aparece dentro (es un pliegue de dos gestos: solo desplegarlo no envía nada;
   al enviarlo sale bajo el botón cuántos acuses creó): cada persona de la audiencia recibe la tarea (`consulta`
   ahora tiene «Confirmar lectura de SGC-PR-01 v1»); repetirlo no duplica. «Todo el hospital» en la demo está
   armada por áreas, así que llega a quien tiene cargo con área: `admin`, sin cargo, queda fuera; y quien pide
   los acuses recibe su tarea en **Inicio** pero no el aviso de la campana. Marque **Lectura obligatoria al ingresar al proceso**, cree un usuario nuevo con el
   proceso SGC: nace su acuse.
8. **Socialización (`lider.gth`).** Si marcó la casilla en el paso 4 (camino largo), la tarea «Registrar la
   socialización de GTH-PR-01 v2»; si no, **Registrar socialización** desde la ficha. Registre la jornada con
   tres asistentes y un PDF de acta: sus acuses quedan «Por asistencia». En la ficha, `consulta` ve la frase de
   la jornada pero no el acta; `control.interno` ve además el enlace a la jornada con su acta. **Anular la
   jornada**, con motivo: los acuses vuelven a pendiente y la frase sale de la ficha.
9. **Verificación (`coordinadora.sgc`, a 390 px o en el celular).** **Distribución** → **Verificaciones** →
   «Toca verificar» en Farmacia → **Verificar** (lleva a una pantalla de confirmación; el botón **Verificar
   Farmacia** abre la verificación, y esa apertura queda en la bitácora): responda la lista, un **No conforme** con **Foto**, **Cerrar la
   verificación**: «Punto no conforme», hallazgo para `regente.farmacia` con fecha; la **Conformidad actual**
   pasa de 50 % (Farmacia conforme, Urgencias no conforme) a 0 %, por debajo del umbral en ambos casos, y la
   insignia lo dice. `regente.farmacia` lo cierra desde **Mis tareas** («Corregir hallazgo en
   Farmacia: …») con **Cerrar hallazgo**. La verificación cerrada no ofrece edición, y el trigger lo impide.
10. **Eliminación.** Emita una copia de `CEX-GU-01` para Odontología (`lider.cex`) y ejecute la eliminación
    (SOL-2026-005, paso 10 de la 13A): la copia queda **Por recoger** y la audiencia recibe «dejó de aplicar»,
    sin tarea de acuse.
11. **Vencimientos.** La demo ya trae vencidos (copia de Urgencias, acuse de `control.interno`, hallazgo de
    Urgencias, Farmacia): la revisión (cada diez minutos como mucho) avisa a los responsables. Para ver el
    escalamiento, baje los plazos a 1 día en **Configuración documental** → **Distribución** y los días para
    avisar al jefe a 1 (**Plazos y escalamiento**): el jefe recibe un aviso sin títulos. Devuélvalos.
12. **Excel.** **Descargar Excel** en **Copias controladas**, **Acuses de lectura** y **Verificaciones**:
    encabezado institucional, celdas neutralizadas, fila en la **Bitácora**. (**Socializaciones** no tiene
    Excel: el spec lo mencionaba y no se construyó; ver Deuda técnica.)
13. **Verificación técnica:** hecha al cierre (ver «Hecho (Fase 13B)»).

**Al terminar:** el recorrido avanza la demo, y `npm test` salta los casos que dependen de ella, con un aviso en
la salida. `npm run db:seed && npm run admin:asegurar` la deja como nueva.

### Avisos para el usuario (Fase 13B)

1. **Escriba la «Dirección de la plataforma» (`url_publica`) en Entidad y marca antes de imprimir copias.**
   Sin ella el sello sale **sin código QR** (el diálogo de emisión lo avisa). Es la dirección que el
   celular alcanza en la intranet (`https://sgc.hospital.gov.co` o `http://192.168.1.20:8443`), sin ruta.
   Base: Práctica (la cabecera `Host` la controla el cliente).
2. **El formato PDF real del hospital trae un pie que ocupa el borde inferior (1,15 cm).** El alto por defecto
   de la franja del sello es 1,0 cm y la taparía: en **Configuración documental** → **Distribución** ponga
   **Alto de la franja del sello** en **0,6** cm (a 0,6 cm el sello todavía se pinta en dos líneas con letra de 6 puntos, el límite; por debajo de 0,6 cm pasa a
   una sola línea). **El QR no baja con la franja:** mide 1,5 cm más 0,15 cm de margen blanco por lado y se dibuja en
   la esquina inferior derecha, así que seguirá cubriendo esa esquina del pie del hospital; baje también el **Tamaño
   del código QR** en la misma sección (sin perder el escaneo) o acepte que la esquina quede cubierta. Pruébelo con
   un documento real antes de imprimir en serie. Base: Práctica.
3. **El QR abre la ficha del documento en la intranet desde el celular.** `?v=` le dice a la ficha qué versión
   se imprimió y ella avisa «Esta copia es de la versión N; la vigente es la M». Exige que el celular alcance
   la intranet y que la persona ingrese con su cuenta. Base: ISO 7.5.3.2 c).
4. **Dos usuarios demo nuevos** (`jefe.urgencias` y `regente.farmacia`) y **la base de desarrollo se resembró**
   en la Tarea 15 de la fase (y los datos de prueba manual se perdieron). `admin` se recreó con la
   `ADMIN_CLAVE` de `.env.local`.
5. **Asigne procesos a todo el personal.** La audiencia de lectura de cada documento sale de los procesos de cada
   persona (y de las listas de distribución), y los procesos también definen qué restringidos ve. Con procesos
   solo para los líderes, cada documento llega a dos personas. La demo asigna procesos a todos. Base: Práctica.
6. **Dos textos del procedimiento del hospital que debe ajustar usted** (spec §5): el SGC-RG-02 «Registro de
   distribución» pasa a ser el registro de copias del sistema, y las «evidencias de socialización y capacitación»
   pasan a ser las jornadas registradas. Están dichos en el capítulo 6, sección 7.
7. **El PDF sellado no se guarda:** se regenera cada vez desde el principal. Si una copia impresa debe
   rehacerse, use **Reimprimir** con motivo (15 minutos de ventana) o anule y emita otra. Base: decisión del usuario.
8. **Para probar desde el celular contra `npm run dev`** hace falta `DEV_ORIGENES=<IP del PC>` en `.env.local` y
   reiniciar el servidor (paso 0 de «Qué probar y cómo (Fase 13B)»). Sin la variable, la página carga con estilo
   pero nada interactivo responde. Solo afecta al desarrollo; la imagen del compose y producción no la necesitan.
9. **Una lista de distribución armada por áreas no alcanza a quien no tiene cargo.** «Todo el hospital» de la demo
   es por áreas; si en el hospital habrá cuentas sin cargo, decida si una lista debe poder incluir «todos los
   usuarios activos» (hoy no existe ese tipo de miembro). Base: spec §6. **Resuelto en la 13C:** existe el miembro
   «Todos los usuarios activos» y «Todo el hospital» de la demo lo usa.

## Qué probar y cómo (Fase 13A)

Recorrido de §20 del spec de la fase
(`docs/superpowers/specs/2026-11-05-fase13a-flujo-documental-design.md`). El capítulo 5 del
manual (`docs/manual/usuario/05-documentos-solicitar-elaborar-revisar-aprobar-y-publicar.md`)
explica cada pantalla.

0. **Preparar.** Base arriba y `npm run dev` → `http://localhost:3002`. **No use 9081:** el
   compose no monta el almacén, así que allí no existen los archivos de la demo y fallan la
   plantilla, las descargas y la marca de agua. La base quedó recién sembrada; para empezar
   de cero: `npm run db:seed && npm run admin:asegurar` (vacía la base y `./almacen`).
   Use ventanas privadas para tener varias sesiones.

   | Usuario | Clave | Papel en el recorrido |
   |---|---|---|
   | `coordinadora.sgc` | `Demo-SGC-2026-clave` | **Hace de Coordinador SGC** (rol Administrador del SGC) |
   | `gerente` | `Demo-SGC-2026-clave` | Aprueba lo estratégico y las eliminaciones que pide un Admin SGC |
   | `control.interno` | `Demo-SGC-2026-clave` | Ve obsoletas y trámites cerrados, en solo lectura |
   | `lider.gth`, `lider.cex` | `Demo-SGC-2026-clave` | Líderes de GTH y de CEX |
   | `consulta` | `Demo-SGC-2026-clave` | Sin permisos; elabora SOL-2026-003 |
   | `admin` | La `ADMIN_CLAVE` de `.env.local` | Segundo Admin SGC. **Pide cambiar la clave al primer ingreso.** No hace falta para el recorrido |

   Los trámites sembrados sirven de atajo:

   | Número | Etapa | Documento | Quién sigue |
   |---|---|---|---|
   | SOL-2026-001 | Publicado | `GTH-CA-01` v3, con cuatro firmas; v2 obsoleta | Nadie. Su acta se genera al primer clic |
   | SOL-2026-002 | Revisión, ronda 2 | `GTH-PR-02` v2 | `coordinadora.sgc` revisa y aprueba. Observación 1 cerrada, 2 atendida |
   | SOL-2026-003 | Publicación, vencido hace 2 días | `GBS-PR-01` v2 | Publica un Admin SGC. Elaboró `consulta`, revisó `lider.gth` |
   | SOL-2026-004 | Aceptación, vence hoy | Crear «Consentimiento informado de procedimientos menores» (CEX, Formato) | `coordinadora.sgc` acepta |
   | SOL-2026-005 | Visto bueno | Eliminar `CEX-GU-01` | `lider.cex` da el visto bueno |

1. **Pedir (`lider.gth`).** **Trámites** → **Nueva solicitud** → **Modificar** `GTH-PR-01`,
   con motivo y justificación → **Enviar solicitud**. Debe verse la etapa Aceptación y
   «Dado: quien pide es el líder del proceso». Otro proceso: la ficha de `CEX-CA-01` no trae
   **Solicitar cambio** y `CEX-CA-01` no sale en su lista. `/tramites/nueva?documento=CEX-CA-01`
   avisa que no puede pedir sobre ese documento.
2. **Aceptar una creación (`coordinadora.sgc`).** Use SOL-2026-004, o pídala como `lider.cex`.
   Debe verse **¿Ya existe un documento parecido?** con `AIN-FO-01` «Muy parecido», de otro
   proceso. Elija «No es un duplicado: es un documento nuevo». El código sugerido es
   `CEX-FO-01`. Escriba `GTH-FO-77` y acepte: «El código debe empezar por CEX-FO-». Vuelva al
   sugerido. **Elabora** `lider.cex`, **Revisa** usted, **Aprueba** viene elegido o se elige
   entre los Admin SGC. **Aceptar y abrir el trámite**: etapa Elaboración, día 1 de 15.
3. **Elaborar (`lider.cex`).** En el bloque del borrador, haga clic en el enlace `SGC-FO-05,
   versión 1` (junto a «Plantilla vigente»): abre la ficha de la plantilla, y desde ahí se
   descarga. Suba un PDF como **Principal (lectura)**. Escriba el **Control de cambios**: con el texto sin
   guardar, **Enviar a revisión** queda desactivado. Guárdelo, envíe y firme con la clave. Una
   clave errada dice «Clave o código incorrectos» y conserva lo demás.
4. **Revisar (`coordinadora.sgc`).** Responda toda la lista con un ítem crítico en **No
   cumple**, pulse **Guardar avance** y firme **Dar concepto favorable**: «Hay un ítem crítico
   que no cumple». Deje dos observaciones y **Devolver a elaboración**. Como `lider.cex`: vea la lista de la ronda 1,
   responda las dos y reenvíe. Como revisora: en la ronda 2 la lista llega propuesta y el
   botón queda desactivado hasta **Guardar avance**. Cierre las observaciones y dé el concepto
   con su clave. Atajo: SOL-2026-002 ya está en la ronda 2, con dos criterios no críticos propuestos
   en **No cumple**: para dar el concepto hay que marcar la casilla de confirmación (paso 15).
5. **Aprobar y publicar en un acto (`coordinadora.sgc`).** En un operativo, por ejemplo
   SOL-2026-002: **Aprobar y publicar** → **Firmar, aprobar y publicar**. Debe verse: Publicado,
   versión 1 obsoleta y versión 2 vigente; **Listado Maestro** con «En la plataforma» en
   **Aprobación**; **Acta de aprobación** con cuatro firmas y una sola huella. Si trae criterios que
   no cumplen, quien aprueba también marca su casilla (paso 15).
6. **Estratégico y Coordinador que elabora.** `lider.cex` pide modificar `CEX-CA-01`; al
   aceptar, **Aprueba** trae a `gerente`. Tras elaborar y revisar, `gerente` pulsa **Aprobar**
   con su clave y `coordinadora.sgc` pulsa **Publicar**. Después, `coordinadora.sgc` pide
   modificar `SGC-PR-01` y se elige en **Elabora**: desaparece de **Revisa** (elija a
   `lider.gth`) y **Aprueba** dice «Elabora un Administrador del SGC: aprueba Gerencia.».
7. **Bloqueo por firma (`lider.gth`).** En un trámite donde él elabora, con archivo y control
   de cambios listos, firme cinco veces con clave errada. Debe verse: cuatro veces «Clave o
   código incorrectos»; a la quinta, la pantalla de ingreso con «Su cuenta quedó bloqueada al
   menos 15 minutos por claves erradas». **Accesos**: cuatro **Firma fallida** y un **Bloqueo**.
   Levántelo como `coordinadora.sgc` en **Usuarios** → `lider.gth` → **Desbloquear**.
8. **Lo que cada quien ve.** Tras el paso 5, `consulta` abre la ficha de `GTH-PR-02` y ve la
   versión nueva; su PDF lleva «COPIA NO CONTROLADA» y «Descargada por Usuario de consulta de
   ejemplo el …»; `/tramites/2` dice «Página no encontrada». `consulta` ve **Trámites** en la
   barra porque elabora SOL-2026-003: es lo esperado. `control.interno`: **Gestión de
   documentos** → `GTH-PR-02`: versión 1 con banda OBSOLETO; el enlace **Trámite de aprobación**
   abre el trámite cerrado con la lista de cada ronda y las observaciones, sin un solo botón.
9. **Restringido: `GTH-FO-01`.** `consulta` no lo encuentra en el proceso GTH, en **Buscar
   documentos**, con `Ctrl K` ni en `/documentos/gth-fo-01`, y una dirección de archivo copiada
   de `lider.gth` da 404. `lider.gth` sí lo ve, con la insignia «Acceso restringido».
10. **Eliminar (SOL-2026-005).** `lider.cex`: **Dar visto bueno**. `coordinadora.sgc`: **Aceptar
    y pasar a aprobación**, con `gerente` como único candidato porque la pidió un Admin SGC.
    `gerente`: **Aprobar**. `coordinadora.sgc`: **Eliminar el documento**. Debe verse: `CEX-GU-01`
    fuera del portal y de la búsqueda; en **Gestión de documentos**, Anulado con banda y
    **Acta de eliminación**; la siguiente Guía de CEX propone `CEX-GU-02`.
11. **Carga directa (`coordinadora.sgc`).** **Gestión de documentos** → **Registrar documento ya
    aprobado**, con **Versión con la que entra** 4. Suba el archivo, llene **Control de la
    versión** y publique: Vigente, «Aprobación registrada fuera de la plataforma» y «Fuera de la
    plataforma» en el Maestro. Registre otro, **Deshacer carga** con motivo y vuelva a
    registrarlo desde su página con **Nueva versión (borrador)**: conserva el código. Sobre un
    vigente, **Nueva versión (borrador)** ya no aparece: el cambio va por **Solicitar cambio**.
    Apague **Publicación directa** en **Configuración documental**: desaparecen **Registrar
    documento ya aprobado** y los botones del camino directo; queda **Descartar borrador**.
    Enciéndala si va a seguir probando.
12. **Lista de verificación sin activos (`coordinadora.sgc`).** En **Configuración documental**,
    desactive todos los ítems: la lista avisa «No hay ítems activos…». En un trámite en revisión,
    **Dar concepto favorable** queda desactivado y dice «No hay ítems activos en la lista de
    verificación. Pida al Administrador del SGC que los active.». Actívelos de nuevo.
13. **Vencidos, tareas, cancelar y reasignar.** La bandeja muestra SOL-2026-003 «Vencido hace 2
    días». El aviso «Solicitud SOL-2026-003: venció el plazo de publicación» llega a los Admin
    SGC con la primera página que alguien cargue (la revisión corre como mucho cada diez
    minutos). **Mis tareas** de cada usuario lista lo suyo. Para ver el escalamiento sin tocar
    la base, baje **Días para avisar al jefe** a 1: en la siguiente revisión `gerente` recibe
    «… el paso de publicación sigue vencido», sin título y sin enlace. Devuélvalo a 3. Reasigne
    y cancele un trámite abierto: quien entra y quien sale reciben aviso, y la versión cancelada
    queda Descartado.
14. **Formato del acta (`coordinadora.sgc`).** La demo ya trae `SGC-FO-06` elegido con 4,2 y 3,2
    cm. En **Configuración documental** → **Formato del acta** debe verse «Las actas nuevas usarán
    SGC-FO-06, versión 1». Pulse **Ver acta de ejemplo**: se abre un PDF de dos hojas con la marca
    «EJEMPLO, SIN VALOR», con el encabezado y el pie del formato en cada hoja y el texto entre los
    dos. Para probar con el formato del hospital, copie su PDF a una carpeta temporal, regístrelo
    como documento (**Registrar documento ya aprobado**, acceso **General**; vuelva a encender
    **Publicación directa** si el paso 11 la apagó, y publique la versión: sin versión vigente el
    formato no sale en la lista) y elíjalo con 5,5 y 3,5
    cm: el texto no debe tocar el encabezado ni el pie. Registre y elija un PDF de dos páginas:
    **Guardar configuración** dice «El formato debe tener una sola página». Escriba los espacios con
    coma («5,5») y con punto: valen igual.
15. **Criterios que no cumplen (`coordinadora.sgc`).** En SOL-2026-002 (revisión, ronda 2), responda
    **Guardar avance** y cierre la observación atendida. Con la lista tal como llega, **Dar concepto
    favorable** abre la ventana con «Esta revisión tiene 2 criterios que no cumplen», cada uno con su
    nota, y la casilla **Doy concepto favorable a pesar de estos criterios**. Sin marcarla no firma.
    Con la casilla marcada y una clave errada, la ventana conserva la casilla y el concepto.
    Quite la nota de un criterio y guarde: **Dar concepto favorable** queda desactivado con «Escriba
    una nota en cada criterio que no cumple». Ponga un ítem **Crítico** en **No cumple**: dice «Hay
    un ítem crítico que no cumple». A 390 px, con notas largas, la ventana se desplaza y el botón
    queda al alcance. Firme el concepto: el bloque **Aprobación** dice «El revisor dio concepto
    favorable con 2 criterios que no cumplen», y **Aprobar y publicar** pide además **Apruebo a
    pesar de estos criterios**. Publique.
16. **El acta con criterios y quién la ve.** El acta de SOL-2026-002 trae la sección **Criterios que
    no cumplen, con concepto favorable**, con cada nota, y «Concepto de Revisó … · Aprobó …». Si no
    cabe en una hoja, sigue en otra con el mismo membrete. SOL-2026-001 ya trae un criterio aceptado.
    Tras el paso 10 (eliminar `CEX-GU-01`), `gerente`, que aprobó la eliminación, abre el trámite y
    su **Acta de eliminación**, y el archivo de la versión anulada da 404 (no tiene permiso de
    historial). Lo mismo le pasa con una versión obsoleta que aprobó: ve el acta, no el archivo.
17. **Verificación técnica:** hecha al cierre. `npm run lint`, `npm test` (2971/2971 en 124 archivos) y
    `npm run build` en verde; la imagen del compose arranca, dice «Migraciones al día» y
    `/api/salud` responde `{"estado":"ok"}`. La 0004 y la 0005 se aplicaron sobre una copia con el
    esquema y la demo de `main`. El CI de `main` pasó sobre `d0c6a42`. En 9081 `/marca/logo` da 404 porque la
    imagen no trae el almacén.

**Segundo factor (no hay usuario demo con él).** Como `lider.cex`, active el segundo factor en
**Mi cuenta** y firme: el diálogo pide además el **Código**. Pruebe también un código de
recuperación: se gasta al usarlo.

**Al terminar:** el recorrido avanza la demo, y `npm test` salta los casos que dependen de ella,
con un aviso en la salida. `npm run db:seed && npm run admin:asegurar` la deja como nueva.

### Avisos para el usuario

1. **`sgc-suaza` (`F:\sgc`) puede tener el mismo truncamiento de subidas.** En la Tarea 8 se vio
   que el proxy de Next guardaba completa solo la parte de un archivo de más de 10 MB y
   respondía 201. Aquí se corrigió (F13A-R10). `sgc-suaza` no se tocó y conviene revisarlo.
   Base: ISO 7.5.3.2.
2. **TOTP sin antirreplay.** Un código del segundo factor se puede reutilizar dentro de su
   ventana, al ingresar y al firmar (heredado). Si se quiere endurecer, es una decisión suya.
   Base: Práctica (RFC 6238 §5.2).
3. **Una página que no se puede ver responde 200 con «Página no encontrada»,** no 404 (F13A-R35).
   No hay fuga: ajeno, inexistente y no numérico responden igual, y los archivos sí dan 404.
   Un 404 real exige reorganizar rutas. Queda para su decisión.
4. **La insignia de la campana cambió también en tema claro:** de rojo sólido a fondo pálido con
   borde, para cumplir AA en oscuro. Conservar el rojo sólido en claro exige un token nuevo.
5. **En el Listado Maestro** la columna de fecha pasó a llamarse «Fecha de aprobación», porque
   la nueva se llama «Aprobación» (F13A-R25).
6. **`revisarVencimientos` no deja fila en `auditoria`:** lo hace el sistema, no una persona. Su
   rastro son los avisos y las marcas del trámite (F13A-R22).
7. **El formato real del hospital trae textos fijos.** Su PDF dice «Código: SGC-FO-0XX» y «Fecha de
   emisión: dd/mm/aaaa» dentro del encabezado: el SGC los imprime tal cual en cada hoja del acta.
   Antes de usarlo en producción, el hospital debe poner su código y su fecha en el Word, volver a
   guardarlo como PDF y publicar una versión nueva (las actas siguientes la usan; las hechas
   conservan la suya). El archivo y el Word del hospital no están en git (`.git/info/exclude`). En
   la prueba con ese formato, 5,5 y 3,5 cm alcanzan: el encabezado ocupa unos 4,8 cm y el pie unos
   3,2 cm, así que el mínimo sin pisarlos está cerca de 5,0 y 3,3 cm.

## Qué probar y cómo (Fase 12)

Recorrido de demostración de §14 del spec de la fase
(`docs/superpowers/specs/2026-11-04-fase12-estructura-visual-design.md`), sobre la base
de desarrollo **tal como está**: no hace falta resembrar y la 0003 ya está aplicada.

0. **Preparar.** Servidor de desarrollo: `npm run dev` → `http://localhost:3002` (la base
   en Docker debe estar arriba). Haga toda la prueba en el mismo servidor: el compose
   (9081) guarda los archivos dentro del contenedor y un logo subido en uno no se ve en
   el otro (Punto de reanudación, punto 3). Cuentas:
   - `admin` con su clave. Si pide cambiarla es porque la Tarea 4 recreó la cuenta con la
     `ADMIN_CLAVE` de `.env.local`; si no la recuerda, `npm run admin:asegurar --
     --forzar-clave` le vuelve a poner esa clave (y pide cambiarla al entrar).
   - Usuarios demo `gerente`, `control.interno`, `lider.gth`, `lider.cex` y `consulta`,
     todos con la clave `Demo-SGC-2026-clave`. Úselos en ventanas privadas para tener
     varias sesiones a la vez.
1. **Marca de la entidad (admin).** Barra lateral → **Administración** → **Entidad y
   marca**. Cambie **Nombre de la entidad** (por ejemplo "Hospital de Prueba"),
   **Sigla** (`HSF`), **Lema**, y los colores: **Color primario** `#0f5e5a` y **Color
   secundario** `#b45309` (los dos cumplen). Mientras escribe, la **Vista previa** cambia
   en claro y en oscuro y las tres líneas dicen "cumple". Pulse **Guardar** → "Cambios
   guardados". Debe verse:
   - la barra lateral con el nombre y la sigla nuevos, la página activa y los botones en
     el verde azulado, y la línea bajo la barra superior del mismo color;
   - en la pestaña del navegador: en **Usuarios**, «Usuarios — Administración SGC · HSF»;
     en **Inicio**, «Hospital de Prueba · SGC»;
   - el lema nuevo en la franja al pie del mapa de **Inicio**;
   - al **Salir**, la pantalla de ingreso con el logo, el nombre nuevo y la pestaña
     «Ingreso · HSF»;
   - **Listado Maestro** → **Descargar Excel**: la primera fila de la hoja trae el nombre
     nuevo.
2. **Color rechazado.** En **Color primario** escriba `#9ecbff`. Debajo del campo aparece
   el mensaje en rojo y la vista previa dice "Primario, texto blanco: 1,7:1 · no cumple".
   Pulse **Guardar**: el servidor rechaza con «El color primario #9ecbff no tiene
   contraste suficiente con el texto blanco (1,7:1; mínimo 4,5:1). Pruebe #4a74a3.», no
   guarda nada y lo escrito en los demás campos sigue ahí. Escriba `#4a74a3` → **Guardar**
   → "Cambios guardados". Cambie el tema a oscuro (menú con su nombre → **Tema** →
   **Oscuro**) y compruebe que el botón **Guardar** y la página resaltada de la barra
   lateral siguen con letra blanca legible.
   Opcional, con el secundario: `#fcd116` → «El color secundario #fcd116 no se distingue
   del fondo (1,4:1; mínimo 3:1). Pruebe #a48700.»
3. **Logo.** En la sección **Logo** → **Subir logo**:
   - un **SVG renombrado**: en el Bloc de notas escriba
     `<svg xmlns="http://www.w3.org/2000/svg"></svg>` y guárdelo como `prueba.png`
     (tipo "Todos los archivos") → «El logo debe ser PNG, JPG o WebP»;
   - un **PNG de más de 1 MB** (una foto o una captura de pantalla grande guardada como
     PNG) → primero el aviso «El archivo pesa N MB; el máximo es 1 MB.» y luego «El logo
     supera 1 MB»;
   - un PNG válido (por ejemplo `src/db/semillas/recursos/logo-demo.png`) → «Logo
     actualizado», y el logo aparece en la barra lateral y en el ingreso. **Quitar logo**
     → «Logo quitado» y vuelve el cuadro con la sigla.
4. **Tema.** Menú con su nombre → **Tema** → **Oscuro**: cambia en menos de medio
   segundo. Con el teclado: abra el menú, llegue con **Tab** a las opciones del tema y
   recórralas con las flechas: el tema se aplica una sola vez, con la opción en la que se
   detuvo (medio segundo después, o al salir con **Tab** o **Escape**), no una vez por
   cada opción. **Salir**: la pantalla de ingreso sigue en oscuro; entrar otra vez: sigue
   en oscuro. Recargue (F5) varias páginas: nunca aparece un destello claro antes del
   oscuro. Elija **Según el sistema** y cambie el modo de Windows (Configuración →
   Personalización → Colores → "Elegir el modo"): el SGC lo sigue en los dos sentidos,
   sin recargar.
5. **Barra lateral por rol** (ventanas privadas):
   - `gerente`: **Inicio**, **Buscar documentos**, **Listado Maestro** y, en
     Administración, **Estadísticas**;
   - `control.interno`: **Inicio**, **Buscar documentos**, **Gestión de documentos**,
     **Listado Maestro**, **Estadísticas**, **Bitácora** y **Accesos**; al abrir
     `http://localhost:3002/admin/entidad` ve **Sin acceso** dentro del cascarón;
   - `lider.gth`: **Inicio** y **Buscar documentos**, y en Inicio el bloque **Mis
     procesos** con Gestión del Talento Humano;
   - `consulta`: solo **Inicio** y **Buscar documentos**;
   - `admin`: las 13 entradas (5 en Documentos, 7 en Administración, más Inicio).
6. **Búsqueda `Ctrl K`.** Con cualquier usuario, `Ctrl K` (o el botón **Buscar…**) →
   escriba «induc»: bajo **Documentos** aparecen los documentos de inducción (entre ellos
   `PR-GTH-002`) con la palabra resaltada; flechas y **Enter** abren la ficha. Escriba
   «usuarios»: con `admin` aparece **Ir a → Usuarios**; con `consulta`, no. **Escape**
   cierra y el foco vuelve al botón **Buscar…**.
7. **Campana.** Use `lider.cex` (o, de alternativa, `lider.gth` o `control.interno`;
   `gerente` y `consulta` ya tienen la bienvenida leída): la campana muestra **1**; si la
   campana ya está en 0, use otro usuario demo. Ábrala y compruebe que se cierra con
   **Escape** (el foco vuelve a la campana) y con un clic fuera, y que abrir el menú con
   su nombre la cierra. Ábrala otra vez → «Bienvenida al SGC Integral»; pulsarla abre
   **Mi cuenta** (pantalla aparte, sin campana) → **Volver al inicio** → la campana ya no
   tiene número y llega cerrada. Con otro usuario, **Marcar todas como leídas** deja el
   contador en 0 sin salir de la página. En esta fase nada crea notificaciones nuevas:
   cada usuario demo sirve para esta prueba una sola vez.
8. **Inicio y celular.** **Inicio** muestra «Mis tareas (0)» con «No tiene tareas
   pendientes. Cuando un documento necesite su revisión o aprobación, aparecerá aquí.» y
   el mapa debajo. Con el navegador a 390 px de ancho (F12 → modo dispositivo) o en el
   celular: el mapa pasa a acordeón; el botón de tres líneas abre el menú lateral,
   **Escape** o la **X** lo cierran.
9. **Imprimir.** **Listado Maestro** → **Imprimir / Guardar PDF**: la vista de impresión
   no trae barra lateral ni superior, usa todo el ancho y sale en claro aunque el tema
   sea oscuro.
10. **Al terminar**, deje la marca demo como estaba: nombre "ESE Hospital Nuestra Señora
    de Fátima de Suaza", sigla `HNSF`, lema "Comprometidos con la vida y el bienestar de
    nuestra comunidad", primario `#1b4e8e`, secundario `#2e9b47` y el logo
    `src/db/semillas/recursos/logo-demo.png`. Lint, tests, build y compose ya pasaron al
    cierre (Punto de reanudación, punto 1); el CI de `main` pasó sobre `d0c6a42`.

Manual de usuario de esta fase: `docs/manual/usuario/03-conocer-la-plataforma.md` y
`docs/manual/usuario/04-configurar-la-marca-de-la-entidad.md`. Los capítulos 1 y 2 se
ajustaron donde describían el menú "Administración" y la barra del panel, que la Fase 12
retiró.

## Qué probar y cómo (Fase 11)

> Ya la hizo el usuario el 2026-11-04; se conserva como registro. Desde la Fase 12 la
> administración está en la barra lateral y no en el menú con su nombre, y la base de
> desarrollo ya no se resiembra para probar.

Recorrido de demostración del spec §8 Fase 11. Base recién sembrada y servidor de
desarrollo en `http://localhost:3002`.

1. Preparar: `npm run db:preparar && npm run db:seed && npm run admin:asegurar && npm
   run dev`.
2. Entrar como `admin` con la `ADMIN_CLAVE` de `.env.local` → **Cambie su clave inicial** (12 a 128
   caracteres, no común, sin el usuario) → **Aviso de datos personales** → portal. El
   cambio obligatorio aparece porque el paso 1 resembró la base y `admin:asegurar`
   recreó la cuenta; sobre una base no resembrada el admin existente solo ve el aviso.
   **`ADMIN_CLAVE` solo se aplica al crear la cuenta:** cambiarla después en `.env.local`
   no cambia la clave de un `admin` que ya existe (el ingreso responde "Usuario o clave
   incorrectos"). Para aplicarla, `npm run admin:asegurar -- --forzar-clave`, que también
   pide cambiarla al ingresar. La clave real va solo en `.env.local`, nunca en
   `.env.example` ni `.env.ensayo`, que están versionados.
3. Menú con su nombre → **Administración** → **Estructura**: crear un área (**Nueva
   área**) y un cargo (**Nuevo cargo**, con área y cargo superior). **Usuarios** →
   **Nuevo usuario**: crear un usuario por rol y anotar la clave temporal que se muestra
   una sola vez. **Usuarios** → **Alta por lote**: descargar la plantilla, borrar su
   fila de ejemplo (`ana.perez`; si se deja, se crea), llenarla con 20 filas válidas y
   2 inválidas (por ejemplo un rol inexistente y un usuario
   repetido), guardarla como CSV UTF-8 y subirla: 20 creados, 2 rechazados con su línea
   y motivo; probar **Descargar resultados (CSV)**.
4. En ventanas privadas, entrar con `gerente`, `control.interno`, `lider.gth` y
   `consulta` (clave `Demo-SGC-2026-clave`):
   - `gerente`: en Administración ve **Listado Maestro** (solo vigentes, sin Excel) y
     **Estadísticas**.
   - `control.interno`: ve **Documentos** (detalle sin botones de edición), **Listado
     Maestro** con Excel, **Estadísticas**, **Bitácora** y **Accesos**.
   - `lider.gth`: el inicio muestra **Mis procesos** con Gestión del Talento Humano; el
     menú no tiene Administración y abrir `/admin` lleva a `/sin-acceso`.
   - `consulta`: solo el portal (mapa, procesos, documentos vigentes, búsqueda).
5. Con `consulta`, cinco claves erradas → la cuenta queda bloqueada: con la clave
   correcta sigue saliendo el mensaje general "Usuario o clave incorrectos. Si falló
   varias veces…" (no se muestra la hora, a propósito: F11-D13). Como `admin`, en
   **Usuarios** la fila dice "Bloqueado hasta HH:MM"; abrir la persona → **Desbloquear**
   → `consulta` vuelve a entrar.
6. Con un usuario de prueba: menú → **Mi cuenta** → **Activar segundo factor** →
   **Activar segundo factor** → escanear el QR con una app (Google Authenticator,
   Aegis…) → código de 6 dígitos + **Clave actual** → **Confirmar y activar** → guardar
   los 8 códigos de recuperación (se ven una sola vez). **Salir**, entrar de nuevo: pide
   **Verificación en dos pasos** con el código de la app. Salir otra vez y entrar con
   **Usar un código de recuperación**. Como `admin`: abrir esa persona en Usuarios →
   **Quitar segundo factor…** → confirmar; el siguiente ingreso ya no lo pide.
7. Como `admin`, **Sesiones**: **Cerrar** la sesión de otro usuario abierto en otra
   ventana; su siguiente clic va a `/ingreso`.
8. **Accesos**, dos pruebas por separado (combinados, los filtros solo muestran
   bloqueos): (a) filtrar por resultado **Bloqueo**: aparece el bloqueo de `consulta`;
   (b) **Limpiar** y filtrar por usuario `consulta`: aparecen sus fallos, el bloqueo y
   el desbloqueo (y el cierre forzado, si fue su sesión la que se cerró en el paso 7).
9. **Bitácora**: las acciones sobre usuarios con texto legible ("Creó el usuario «…»",
   "Creó N usuarios por lote (M rechazados)", "Desbloqueó al usuario «…»", "Cerró la
   sesión de «…»", "Desactivó el segundo factor"…).

10. **Arreglos de la revisión final:** (a) con un usuario recién creado, escribir la
    clave temporal como clave nueva → «La clave nueva debe ser distinta de la clave
    temporal.»; (b) crear en Estructura dos cargos con el mismo nombre en áreas distintas
    y subir un lote con ese cargo → la fila se rechaza pidiendo `Área > Cargo`, y con
    `Área > Cargo` se crea con el área correcta; (c) restablecer la clave de un usuario
    **bloqueado** → la clave temporal sigue en pantalla aunque «Desbloquear» desaparece;
    (d) quitar el segundo factor a un usuario con sesión abierta en otra ventana → su
    siguiente clic va a `/ingreso`; (e) abrir `/ingreso?motivo=__proto__` → la página
    carga normal. La regla «Debe quedar al menos un Administrador del SGC activo.»
    (F11-D34) no se alcanza desde la interfaz sin dos cambios simultáneos (nadie se baja a
    sí mismo y quien deja de ser admin pierde el permiso): la prueban los tests.

Manual de usuario de esta fase: `docs/manual/usuario/01-ingreso-clave-y-segundo-factor.md`
y `docs/manual/usuario/02-usuarios-cargos-y-procesos.md`.

## Hecho (Fase 14A)

Plan: `docs/superpowers/plans/2026-11-10-fase14a-indicadores.md`; diseño:
`docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md` (común a la 14A y la 14B; §5.1 dice qué va en cada una).
El indicador de punta a punta, del ISO 9001:2015 4.4.1 c), 9.1.1 y 9.1.3: el hospital ya puede llevar sus indicadores como
los ocho del Excel del usuario. **Sin dependencias npm nuevas** (`exceljs`, `zod` y `pdf-lib` ya estaban; las animaciones
son CSS, F14-DC23). La rama `fase-14a-indicadores` (90 confirmaciones sobre `bced185`) se trabajó en el worktree
`F:\sgc-integral-f14a` contra la base aparte `sgc_f14a`; no está publicada ni fusionada.

- **Rutas nuevas:** `/indicadores` (la lista) con las pestañas `/indicadores/matriz`, `/indicadores/por-aprobar` y
  `/indicadores/cierre`; `/indicadores/nuevo`; `/indicadores/[codigo]` (vistas Resultados, Ficha técnica con `?version=N`,
  Versiones y Observaciones), `/indicadores/[codigo]/editar`, `/indicadores/[codigo]/imprimir` y
  `/indicadores/[codigo]/reportar/[periodo]`; los Excel `GET /indicadores/excel` y `GET /indicadores/[codigo]/excel`;
  `GET /indicadores/[codigo]/soportes/[archivoId]/[[...nombre]]` (siempre como descarga; 404 a quien no ve soportes); la
  subida `POST /api/mediciones/[id]/archivos` (fuera del `matcher` del proxy); y `/admin/indicadores` (maestros y
  parámetros, dentro del panel). Las URL existentes se conservan; los códigos `nuevo`, `matriz`, `por-aprobar`, `cierre` y
  `excel` están reservados.
- **Esquema (`drizzle/0011_fase14-indicadores.sql`):** 24 tablas nuevas, las 16 de la 14A (`tipos_indicador`,
  `clasificaciones_indicador`, `unidades_indicador`, `objetivos`, `indicadores`, `indicador_versiones`,
  `indicador_variables`, `indicador_responsables`, `indicador_normas`, `indicador_designados`, `indicador_metas`,
  `mediciones`, `medicion_valores`, `medicion_eventos`, `medicion_observaciones` y `cierres_indicadores`) y las 8 de la 14B,
  vacías hasta entonces (`variables_compartidas`, `variable_responsables`, `variable_valores`, `calculo_fotos`,
  `dimensiones`, `dimension_categorias`, `reportes_externos` e `impactos_indicadores`); `firmas.indicador_version_id` con
  `firmas_tramite_coherente` ampliado; `archivos.contexto` gana `medicion` y `reporte_externo`; las cinco claves `ind_*`
  de configuración (umbral de atención 70, aviso previo 3, plazo de reporte 10, incumplimiento repetido 3, variación que
  pide confirmación 30) y los tres maestros (tipos, clasificaciones y unidades) si están vacíos. Triggers: solo inserción
  en `medicion_eventos`, `medicion_observaciones` y `cierres_indicadores`; `sgc_impedir_si_medicion_cerrada` (una medición
  cerrada no cambia salvo la reapertura) y `sgc_impedir_si_version_aprobada` (una versión aprobada, ni sus hijas).
  `medicion_eventos`, `medicion_observaciones` y `cierres_indicadores` entran al `REVOKE UPDATE, DELETE` de `sgc_app`
  (`cierres_indicadores` desde la ola final de corrección, M1, en `src/db/roles-bd.ts`). **Doce migraciones en total
  (0000 a 0011).** Aditiva: sobre una base de la 13C o de `sgc-suaza` no se renombra ni se borra nada.
- **Permisos (`src/lib/permisos.ts`):** `indicadores.administrar` (admin_sgc), `indicadores.aprobar` (gerencia,
  lider_proceso), `indicadores.medir` e `indicadores.observar` (los cinco roles; la condición de persona se comprueba en
  el servidor). Las reglas de alcance de los indicadores viven al final de `src/lib/alcance.ts` (`filtroIndicadores`,
  `puedeVerIndicador`, `puedeVerSoportes`, `puedeMedir`, `puedeAnalizar`, `puedeRegistrarHistoricos`, `puedeObservar`,
  `aprobadoresDeFicha`, `puedeAprobarFicha`, `esAprobadorDe`, `responsablesDeMedir`, `responsablesDeAnalizar`,
  `sinResponsable`, `responsableDe` y `participaEn`), con las dos excepciones nombradas a `alcanceProcesos()`.
- **Reglas puras:** `src/lib/indicadores/` con el intérprete de fórmulas (`formula/`: analizar, evaluar con fracciones
  exactas de `bigint`, las formas y la fórmula en palabras), periodos y fechas límite, semáforo y rangos en palabras,
  textos (la cifra que no contradice el veredicto, la frase, la comparación, la variación), acumulado, estados, cálculo,
  ficha (mayor o menor, huella), reporte, resultados, cierre, historial de la corrección, filtros, Excel, la ficha en texto
  y rutas; `periodoDe` (`src/lib/indicadores-documentales/periodo.ts`) gana el bimestre. Esquemas
  `src/lib/esquemas/indicadores.ts` e `indicadores-maestros.ts`.
- **Consultas (`src/db/consultas/indicadores/`):** maestros y parámetros, fichas (crear, guardar, abrir un cambio, código
  propuesto), aprobación (enviar, aprobar en bloque, devolver, descartar, «rige desde», versiones), operación (designar,
  datos de operación, duplicar, retirar, borrar, descartar), mediciones (`asegurarMediciones`, reportar, guardar sin
  reportar, «no aplica» y el único camino de cálculo `recalcularMedicion`), análisis, observaciones, soportes, históricos,
  metas, cierre y reapertura, alertas, tareas, vencimientos, lectura, lista, matriz, impresión y búsqueda. Acciones en
  `src/app/acciones-indicadores.ts` y `src/app/admin/acciones-indicadores.ts`.
- **Componentes:** `src/componentes/indicadores/` (lista y filtros, matriz, pestañas, la página por vistas, la ficha y su
  formulario, la prueba, el diálogo de envío, «Por aprobar», el reporte con el resultado en vivo, los soportes, el
  análisis, las observaciones, la tabla del año y la de históricos, las metas, el cierre, la reapertura, la administración
  y los maestros) y, en `src/componentes/ui`, las gráficas de tubos (`GraficoTubos`, `MiniTubos`, `TuboAcumulado`,
  `TuboSvg`, `TarjetaDeTubo`, `Tendencia`, `BarraEstados`, con su geometría en `geometria-tubos.ts`), con sus tokens de
  brillo y sombra en `globals.css` para claro y oscuro y su tabla equivalente.
- **Pantallas existentes:** la barra lateral con el grupo **Indicadores** (su insignia de reportes vencidos a cargo de la
  persona) y **Configuración de indicadores** en Administración; `Ctrl K` y **Buscar documentos** con el grupo
  **Indicadores**; la página del proceso y la del subproceso con **Indicadores del proceso**; la ficha de una norma con
  **Indicadores que exige**; **Tipos de documento** rechaza la sigla `IND`; `ZonaCarga` admite el soporte `.xlsx`; la regla
  global de impresión ya no imprime «Saltar al contenido».
- **Tareas, avisos y vencimientos:** `misTareas` suma reportar, analizar, responder una observación, aprobar una ficha y
  retomar una devuelta (agrupadas pasadas cinco las de reportar, analizar y aprobar), sin escribir (F14A-R2). Avisos
  `indicadores.por_aprobar`, `.aprobada`, `.devuelta`, `.designacion`, `.retirado`, `.observacion`, `.respuesta`,
  `.reabierta`, `.alerta`, `.correccion`, `.por_vencer`, `.vencido` y `.escalado`. `revisarVencimientos` gana
  `revisarVencimientosDeIndicadores`: abre los periodos que terminaron, el aviso previo, el vencido (a quien lo tiene y,
  por proceso, a sus líderes) y el escalamiento al jefe sin nombrar el indicador; nada para los históricos ni los «no
  aplica».
- **Bitácora:** 33 acciones nuevas (contadas en `src/lib/bitacora-detalle.ts`), con frase y nombre de filtro (`indicador_*`,
  `medicion_*`, `indicadores_mes_cerrado` y las dos de exportación, `exporto_ficha_indicador` y
  `exporto_resultados_indicadores`).
- **Semilla:** `src/db/semillas/indicadores-demo.ts`, `indicadores-demo-agenda.ts` (la historia como datos, con el
  calendario relativo a la siembra) e `indicadores-demo-fichas.ts`, todo por las funciones del dominio y con firmas
  (paso 0 de «Qué probar y cómo (Fase 14A)»); la mínima siembra los maestros y los parámetros, sin objetivos ni
  indicadores.
- **Pruebas:** 38 archivos nuevos (intérprete con entradas hostiles, reglas puras, flujo contra la base en transacciones
  que se revierten, visibilidad con los cinco roles, vencimientos, pantallas, gráficas, Excel, impresión, semilla; dos de
  ellos de la ronda 1, `file-type-empaquetado` e `indicadores-limite-grafica`) y los
  estructurales ampliados (`permisos`, `paginas-sesion`, `acciones-permisos`, `proxy-matcher`, `privilegios-bd`,
  `navegacion`, `bitacora-detalle`, `esquema`).
- **`AGENTS.md`** quedó con lo de la 14A del spec §20: las dos tablas de solo inserción, las mediciones cerradas, las
  versiones aprobadas y los cierres inmutables, la regla de las fórmulas, el único camino de cálculo, el veredicto con el
  valor exacto, las dos excepciones de alcance, la estructura del módulo y el aviso de los nombres de la 13C, la acción
  nueva en la lista fija, las firmas de ficha, la sigla `IND`, la ficha firmada, los históricos, la fila «Animación» del
  stack y la regla de los tests.
- **Lo que comprobó el controlador (2026-11-12):** la imagen `sgc-integral:f14a`, en un contenedor aparte, arrancó con
  «Migraciones al día» y respondió `/api/salud` con `{"estado":"ok"}`; la `0011` sobre una copia de la base del usuario
  pasó de 11 a 12 migraciones y sembró 3 tipos, 3 clasificaciones, 7 unidades y 5 parámetros, sin indicadores, con los
  usuarios intactos (la copia se borró); y el recorrido de §24 en el navegador (claro, oscuro, 390 px y la pantalla de
  reporte solo con el teclado) dio, de 18 pasos, 16 bien, el 8 con una diferencia del texto del recorrido y el 7 fallido
  por el soporte `.xlsx`, con trece defectos (1 crítico, 1 importante y 11 menores).
- **Ronda 1 de corrección** (trece confirmaciones, de `fbaae29` a `f89c79a`; F14A-R41 a R50): el soporte `.xlsx` entra
  (D-1, `fileTypeFromBuffer`); las gráficas de tubos miden según sus periodos y arrancan en el último con valor (D-2,
  `DesplazableDeTubos`); la unidad sigue a la forma (D-3); el motivo de «no aplica» sin doble punto (D-4); las fechas de
  las pantallas con el formato de la app, «8 jul 2026, 09:05» (D-5, `fechaYHora`); la hoja impresa sin el bloque gris
  (D-6); el límite de crítico con un solo texto y escalonado con la meta (D-7 y D-8); los retirados marcados en la matriz y
  su Excel, sin «por venir» (D-9); la línea base de las fichas de la demo (D-10); «No aplica» aparte en la barra de la
  lista (D-11); el foco en el análisis después de reportar (D-12); los errores de la ficha junto a su campo (D-13); y la
  confirmación «Se devolvió la ficha …». El recorrido de arriba corrige además los pasos 0, 2, 3, 4, 7, 8, 13 y 19 y
  los avisos 4 y 9, y el manual sus secciones 2.1, 2.7, 3.2, 3.4, 5.4 y 6.1.
- **Verificado al cierre de la ronda 1** (por el guardián de la base aparte): resiembra de `sgc_f14a` (`db:seed` y
  `admin:asegurar`); `npm run lint` limpio; `SEMILLA_RECIEN=1 npm test` con la demo recién sembrada: **235
  archivos, 5675 pruebas en verde y 1 saltada** (el `ctx.skip` de `tests/ratificaciones.test.ts`, «el acta
  registrada de un trámite no cambia con firmas sin trámite en la base», cuando la base no tiene un acta regenerable; ya
  estaba en la línea base de la fase); `npm run build` sin `DATABASE_URL` ni `DATABASE_URL_MIGRADOR` en verde; y otra
  resiembra al final. Cada tarea tuvo su revisión con su ronda de corrección (en la bitácora de ejecución) y puntos de
  control en el navegador tras las Tareas 7, 10, 12, 15, 16 y 17 y la ficha impresa de la 18. Después, el controlador
  subió un `.xlsx` real con el arreglo de D-1, en `next dev` y en la imagen reconstruida (contenedor aparte): entra
  («Listo», «Excel, 6 KB») y un `.xls` se rechaza con el mensaje del soporte.
- **Ola final de corrección** (doce confirmaciones, de `5b73fe8` a `e694135`; F14A-R51 a R53), tras la
  revisión de toda la rama: una norma citada por una ficha de indicador, aunque sea un borrador, ya no da el error crudo
  de la llave al borrarla (`historiaDeNorma`, y el servidor decide si ofrece **Borrar…**, C1); el plazo de reporte y
  «soporte obligatorio» llegan a las mediciones en curso (fecha límite, avisos y estado, I1); corregir, reabrir o
  reportar tarde un periodo recalcula la racha de los siguientes (I2); `cierres_indicadores` entra al `REVOKE` de
  `sgc_app` (M1); la matriz y el cierre abren los periodos indicador por indicador (M3); la ficha de la norma no cae si
  falla «Indicadores que exige» (M4); «Estado: Sin dato» no trae los «No aplica» (M6); el valor bajo cada tubo vuelve a
  llevar su unidad cuando cabe (M7); un soporte repetido dice «Ya hay un soporte con ese nombre en esta medición» (M8);
  el formato de `firmas` en el esquema (M9) y la documentación (M10: F14A-R41 en `AGENTS.md`). Quince pruebas nuevas; el
  recorrido de arriba gana el paso 19 y el manual, tres frases (capítulos 7 y 8). Lo que la revisión dejó como deuda está
  en «Deuda técnica conocida».
- **Verificado al cierre de la ola final** (por el guardián de la base aparte): resiembra de `sgc_f14a`; `npm run lint`
  limpio; `SEMILLA_RECIEN=1 npm test` con la demo recién sembrada: 235 archivos, 5690 pruebas en verde y 1 saltada (la
  misma de antes); `npm run build` sin `DATABASE_URL` ni `DATABASE_URL_MIGRADOR` en verde; y otra resiembra al final.
  `npm run db:roles` (por el guardián) aplicó el `REVOKE` nuevo a `sgc_f14a`; en otra base lo aplica `npm run db:preparar`
  (o `db:roles`), o el arranque de la imagen: `npm run dev` no lo hace (ver «Avisos para el usuario (Fase 14A)», 10).
- **Residuos de la ola final** (tres confirmaciones, de `e0f39a7` a la de esta documentación), tras su re-revisión: «soporte
  obligatorio» rige hacia adelante (activarlo solo alcanza lo que sigue en plazo; lo reportado a tiempo no se vuelve
  vencido, y la racha de los siguientes no lo reabre: `sistema` en `recalcularMedicion`), el recálculo de sistema dice
  qué pasó con la marca y su motivo en el historial, y la gráfica de tubos arranca en el borde de una columna
  (`desplazamientoInicial`: a 390 px el «83,3 %» de `SGC-IND-01` se leía «3,3 %»). Seis pruebas nuevas; el aviso 10 para
  el usuario (`npm run db:preparar` antes de `npm run dev`).
- **Verificado al cierre de los residuos** (por el guardián): resiembra; `npm run lint` limpio; `SEMILLA_RECIEN=1 npm test`
  con la demo recién sembrada: **235 archivos, 5696 pruebas en verde y 1 saltada**; `npm run build` sin URL de base en
  verde; y otra resiembra al final.

## Hecho (Fase 13C)

Plan: `docs/superpowers/plans/2026-11-08-fase13c-vigencia-externos-normograma.md`; diseño:
`docs/superpowers/specs/2026-11-08-fase13c-vigencia-externos-normograma-design.md`. Los pasos 11 y 13 del procedimiento de
control de documentos del hospital quedan dentro del sistema, con la evidencia de PC-11 y PC-13 (spec §5 y Apéndice A), y
con ellos se cierra la Fase 13. **Sin dependencias npm nuevas** (`pdf-lib`, `exceljs` y `zod` ya estaban). La rama
`fase-13c-vigencia-externos-normograma` (64 confirmaciones sobre `4bbb428`) se fusionó en `main` el 2026-11-10 (`8acc9cf`,
PR #3); la rama sigue publicada, lista para borrarse, y el recorrido del usuario sigue pendiente. La caracterización estructurada del spec maestro no se
construyó (decisión 3 del usuario, spec §5): el documento tipo CA sigue siendo la caracterización.

- **Rutas nuevas:** `/vigencia` (lleva a la pestaña que le toca a la persona) con `/vigencia/semaforo`,
  `/vigencia/revision-anual`, `/vigencia/externos` y `/vigencia/indicadores`, y sus Excel
  (`/vigencia/{semaforo,externos,indicadores}/excel`); `/vigencia/externos/{nuevo,[id]}` y
  `/vigencia/externos/[id]/archivos/[archivoId]/[[...nombre]]` (los archivos del borrador, F13C-R9);
  `/vigencia/revision-anual/[id]` y `/vigencia/revision-anual/[id]/informe` (el PDF); `/normograma`,
  `/normograma/{nueva,[id],[id]/editar}`, `/normograma/[id]/archivos/[archivoId]/[[...nombre]]`, `/normograma/excel` y
  `/normograma/impactos/[cambioId]`; `/distribucion/socializaciones/excel`;
  `/distribucion/verificaciones/hallazgos/[id]/archivos/[archivoId]/[[...nombre]]` (la foto de la corrección);
  `/admin/api/informe-ejemplo`; las subidas `POST /api/externos/[versionId]/archivos`, `POST /api/normas/[id]/archivos` y
  `POST /api/hallazgos/[id]/archivos`, con sus `DELETE` donde aplica (fuera del `matcher` del proxy). Los catálogos de
  puntos de uso y listas pasan de `admin/(panel)` a `admin/(catalogos)` con las mismas URL (F13C-DC32). Las URL existentes se
  conservan.
- **Esquema (`drizzle/0008_fase13c-vigencia-externos-normograma.sql`):** tablas `ratificaciones`, `externos`,
  `externo_verificaciones`, `revisiones_anuales`, `revision_anual_procesos`, `revision_anual_decisiones`, `tipos_norma`,
  `normas`, `norma_relaciones`, `norma_cambios`, `norma_procesos`, `norma_documentos` e `impactos_normativos`;
  `tipos_documento.meses_revision`; `documentos.origen`, `meses_revision`, `proxima_revision_fijada`, `fijada_por`,
  `fijada_en`, `fijada_nota`, `revision_aviso_en` y `revision_escalado_en`; `documento_versiones.edicion_externa` y
  `fecha_edicion_externa`; `tramites.revision_anual_id` e `impacto_id`; `hallazgos` con la corrección y la validación
  (`corregido_por`, `corregido_en`, `nota_correccion`, `reaperturas`, `validacion`, `validacion_verificacion_id`);
  `firmas.tramite_id` y `lista_miembros.referencia_id` dejan de ser obligatorias con un `CHECK` (F13C-DC26, DC27);
  `archivos.contexto` gana `norma`, `revision_anual` y `hallazgo`. `ratificaciones`, `externo_verificaciones` y
  `norma_cambios` son de solo inserción (trigger y `REVOKE` de `sgc_app`) y un trigger congela la revisión cerrada, sus
  procesos y sus decisiones. **`0009_fase13c-tipos-norma-y-endurecimiento.sql`:** los nueve tipos de norma si la tabla está
  vacía, los triggers de los hijos de una revisión cerrada también en `INSERT` y dos `CHECK` (F13C-R2, R3).
  **`0010_fase13c-baja-de-relaciones.sql`:** la baja lógica de las relaciones entre normas (F13C-R10). **Once migraciones
  en total (0000 a 0010).** Aditivas: sobre una base de la 13B o de `sgc-suaza` no se renombra ni se borra nada.
- **Permisos (`src/lib/permisos.ts`):** `vigencia.ver`, `documentos.indicadores` (admin_sgc, gerencia, control_interno,
  lider_proceso), `documentos.ratificar` (admin_sgc, gerencia, lider_proceso), `revision_anual.gestionar` y
  `normograma.administrar` (admin_sgc), `revision_anual.decidir`, `externos.gestionar` y `normograma.procesos` (admin_sgc,
  lider_proceso) y `externos.verificar` (los cinco roles; la condición de persona se comprueba en el servidor). Las reglas de
  alcance nuevas viven en `src/lib/alcance.ts` (`puedeVerVigencia`, `puedeRatificar`, `puedeVerExterno`,
  `puedeGestionarExterno`, `puedeVerRevisionAnual`, `puedeVerInformeAnual`, `puedeDecidirEn`, `puedeVerImpacto`,
  `puedeAsociarNorma`).
- **Reglas puras:** `src/lib/vigencia/` (plazo y fecha base, semáforo, tipos, decisiones, filtros y Excel del semáforo,
  externos e indicadores), `src/lib/normograma/` (tipos, filtro y Excel), `src/lib/indicadores-documentales/` (definiciones,
  metas, periodos y textos), `src/lib/informe-anual.ts` (el PDF del informe), `src/lib/pdf-hoja.ts` (la hoja sobre el
  membrete, compartida con el acta), `src/lib/tramites/dia-de-etapa.ts`, `src/lib/distribucion/hallazgos.ts` y
  `socializaciones-excel.ts`, y los esquemas `src/lib/esquemas/{vigencia,normograma,mapa}.ts`.
- **Consultas:** `src/db/consultas/vigencia/` (`fragmentos.ts` con `columnasDeVigencia`, la consulta del semáforo que usan
  la ficha, las listas, el Maestro, la página del proceso, las tareas y los indicadores; `semaforo.ts`,
  `ratificaciones.ts`, `externos/`, `revision-anual/` (campaña, registro de decisiones, cierre, lectura, tareas y
  vencidos), `informe.ts` (`asegurarInforme`), `indicadores.ts`, `tareas.ts`, `vencimientos.ts` y `comun.ts`),
  `src/db/consultas/normograma/` (normas, relaciones, asociaciones, impactos, búsqueda, tipos y vencidos),
  `src/db/consultas/origen.ts` (la guarda de los externos) y `src/db/consultas/distribucion/otro-admin.ts`. Acciones en
  `src/app/acciones-vigencia.ts` y `src/app/acciones-normograma.ts`. Componentes en `src/componentes/vigencia/` (con
  `externos/`, `revision/` e `indicadores/`) y `src/componentes/normograma/`.
- **Pantallas existentes:** la ficha del documento con los bloques **Vigencia** (o **Documento externo**) y **Normas
  enlazadas**, y la leyenda «En revisión anual …»; la página del proceso y del subproceso con el resumen de vigencia, el chip
  por documento y **Normas aplicables**; **Gestión de documentos** con la columna y el filtro **Vigencia** y **Registrar
  documento externo**; el **Listado Maestro** y su Excel con Origen, Edición, Última revisión, Próxima revisión («Fijada por
  …»), Vigencia y la aprobación «Adoptado»; **Tipos de documento** con el plazo de revisión; **Configuración documental**
  con las secciones **Vigencia** (y **Ver informe de ejemplo**) e **Indicadores documentales**; `/tramites/nueva`
  prellenada desde la revisión anual y desde un impacto, sin externos; la solicitud con «Abierto desde la revisión anual …»
  o «Abierto por el cambio de …»; la búsqueda y `Ctrl K` con el grupo **Normas**; la barra con **Vigencia** (con la insignia
  de vencidos) y **Normograma**.
- **Lo heredado de la 13B (spec §12):** Excel de socializaciones (asistentes «Reservada» para quien no los ve); fecha de
  corrección elegida en el diálogo de cierre de la verificación (F13C-R36); **Puntos de uso** y **Listas de distribución**
  en solo lectura para `distribucion.ver`; el miembro «Todos los usuarios activos»; los hallazgos en dos pasos
  («Corregido» con nota y foto, «Validar», «Reabrir…», «Cerrar directamente…» y la validación por la siguiente verificación,
  F13C-R31 a R35); el aviso «Se emitieron N copias» de **Reemplazar**, que ya se ve; y los conteos de copias del líder, que
  incluyen las de puntos de otros procesos.
- **Tareas, avisos y vencimientos:** `misTareas` suma revisar la vigencia, verificar un externo, adoptar una edición nueva,
  decidir en la revisión anual, revisar un impacto normativo y validar la corrección de un hallazgo, y agrupa pasadas cinco
  las de vigencia y de externos como las lecturas (F13C-R38, R39). La insignia de **Vigencia** y las tareas salen de una sola
  lectura de la vigencia por página. Avisos `vigencia.vencida` y `.escalado`, `externos.vencida`, `.edicion_nueva`,
  `.retirado` y `.escalado`, `normograma.cambio`, `.impacto_vencido` y `.escalado`, `revision.abierta`, `.prorrogada`,
  `.vencida`, `.escalado`, `.normograma_cambios` y `.cerrada`, y `hallazgo.por_validar`. `revisarVencimientos` gana los documentos
  vencidos, los externos, los impactos y la revisión anual vencida, agrupados por persona y proceso, sin avisos por los
  documentos de una revisión abierta (F13C-DC6), con escalamiento al jefe sin títulos.
- **Bitácora:** las acciones nuevas de la fase tienen frase y nombre de filtro propios en `src/lib/bitacora-detalle.ts`
  (la Tarea 14 dio frase a 46 acciones nuevas y amplió 2, y su revisión las comprobó contra el `detalle` que escribe el
  código); las relaciones
  entre normas, que auditan en las dos normas, se agrupan en una línea.
- **Semilla:** `src/db/semillas/vigencia-demo.ts` (normograma, externos con su PDF, carga inicial con fechas fijadas y
  ratificaciones, la revisión anual abierta y el formato del informe `SGC-FO-07`) y `src/db/semillas/clave-demo.ts`; un
  solo reloj para toda la siembra; la mínima siembra el tipo `DE`, los tipos de norma y las claves de vigencia y metas.
  `tests/utiles/demo.ts` (`estadoDeLaDemo`) detecta cada paso del recorrido para que los tests de semilla salten con aviso
  si la demo avanzó.
- **`AGENTS.md`** quedó con las reglas de la fase (Tarea 14): tablas de solo inserción, adopción y retiro de externos por
  los dos caminos de siempre, fecha base, revisión anual, firmas sin trámite, páginas de Vigencia y del normograma,
  catálogos fuera del panel y subidas nuevas.
- **Verificado al cierre:** la última corrida completa de la bitácora es `SEMILLA_RECIEN=1 npm test` sobre la demo
  recién sembrada en la base aparte, tras la corrección final (197 archivos, **4722 pruebas en verde y 1 saltada**: el
  `skipIf(!DATABASE_URL_MIGRADOR)` de `esquema-fase13c`); lint limpio; `npm run build` sin URL de base en verde; la imagen
  del compose de desarrollo arranca con «Migraciones al día» (once) y responde `/api/salud`; la 0008 a 0010 se ensayaron
  sobre una copia con la demo de `main` (el acta congelada conserva su huella) y sobre otra con solo el esquema heredado de
  `sgc-suaza` (0000 y 0001); el recorrido de §19 se hizo en el navegador sobre la base aparte, y la corrección final se
  volvió a mirar ahí (F-I1 de punta a punta, F-I4, W1, W2, W3 en claro, oscuro y 390 px, N2 y las ayudas). La revisión de
  cada tarea quedó asentada en la bitácora de ejecución, con puntos de control en navegador tras las Tareas 4, 5, 7, 9, 11,
  12, 13, 14 y 15 y la revisión final de toda la rama con una sola ronda de corrección.

## Hecho (Fase 13B)

Plan: `docs/superpowers/plans/2026-11-07-fase13b-distribucion-puntos-de-uso.md`; diseño:
`docs/superpowers/specs/2026-11-07-fase13b-distribucion-puntos-de-uso-design.md`. Los pasos 9 y 10 del
procedimiento de control de documentos del hospital quedan dentro del sistema, con la evidencia de PC-08 (parte
física), PC-09 y PC-10 (spec, Apéndice A). **Sin dependencias npm nuevas** (`pdf-lib`, `qrcode` y `exceljs`
ya estaban). La rama `fase-13b-distribucion-puntos-de-uso` (42 commits sobre `f08f01d`) se fusionó en `main` el
2026-11-08 (`2e321b6`, PR #2) y se borró.

- **Tras la revisión del usuario (2026-11-08):** **Gestión de documentos** filtra al escribir, sobre la lista ya
  cargada y sin tocar la dirección: texto sobre código y título (sin tildes ni mayúsculas, todas las palabras),
  y tipo, proceso y estado exactos; las opciones salen de las filas y una fila con vigente y borrador responde a
  los dos estados (`src/lib/filtro-documentos-admin.ts`, `TablaDocumentosAdmin`, columna **Procesos** nueva;
  `listarDocumentosAdmin` devuelve `procesos`). Y `DEV_ORIGENES` en `next.config.ts` (`allowedDevOrigins`)
  para abrir `next dev` desde el celular: sin la variable, desde otro origen la página no hidrata.
- **Corrección de seguridad tras la fusión (revisión automática del push):** el líder de proceso veía, en la
  lista y la página de copias y en su PDF, las copias de un documento **restringido** de otro proceso entregadas en
  un punto suyo (el responsable del punto sí lo ve, por eso la emisión era válida). `condicionVista` exige ahora el
  nivel de acceso sobre las copias de sus puntos y `copiaParaPdf` comprueba `puedeAccederDocumento` siempre: el
  PDF es el documento entero. Prueba en `tests/copias.test.ts`.
- **Rutas nuevas:** `/distribucion` y sus cuatro pestañas (`/distribucion/{copias,acuses,socializaciones,verificaciones}`),
  `/distribucion/copias/[id]`, `/distribucion/copias/[id]/pdf`, `POST /distribucion/copias/[id]/reimprimir`,
  `/distribucion/socializaciones/{nueva,[id]}` y `…/[id]/archivos/[archivoId]/[[...nombre]]`,
  `/distribucion/verificaciones/{nueva,[id]}` y `…/[id]/archivos/[archivoId]/[[...nombre]]`,
  `/distribucion/{copias,acuses,verificaciones}/excel`, `/acuses` y `/acuses/[id]`,
  `/admin/puntos-uso`, `/admin/puntos-uso/{nuevo,[id]}`, `/admin/listas-distribucion`,
  `/admin/listas-distribucion/{nueva,[id]}`, y las subidas `POST /api/socializaciones/[id]/archivos`,
  `POST /api/verificaciones/[id]/items/[itemId]/archivos` con sus `DELETE …/[archivoId]` (las dos, fuera del
  `matcher` del proxy). Las URL existentes se conservan.
- **Esquema (`drizzle/0006_fase13b-distribucion.sql`):** tablas `puntos_uso`, `punto_uso_procesos`,
  `copias_controladas`, `copia_eventos`, `listas_distribucion`, `lista_miembros`, `documento_listas`, `acuses`,
  `acuse_eventos`, `jornadas`, `jornada_versiones`, `jornada_asistentes`, `socializaciones_requeridas`,
  `verificaciones`, `verificacion_items` y `hallazgos`; `documentos.lectura_obligatoria_ingreso`,
  `tramites.requiere_socializacion`; `archivos` con `contexto` (`version`, `jornada`, `verificacion_item`) y
  `contexto_id`, `version_id` opcional y `CHECK`; unicidad parcial de acuses (`pendiente`, `confirmado`) y de
  verificación abierta por punto, y número de copia único por versión. `copia_eventos` y `acuse_eventos` son de solo
  inserción (trigger y `REVOKE` de `sgc_app`); un trigger nuevo protege las verificaciones cerradas y sus
  ítems. **`0007_fase13b-item-retirado.sql`:** `verificacion_items.retirado` (la marca «Retirado en el acto» se
  persiste antes de cerrar). **Ocho migraciones en total (0000 a 0007).** Aditivas: sobre una base de la 13A o de
  `sgc-suaza` no hay datos que transformar.
- **Permisos (`src/lib/permisos.ts`):** `distribucion.ver` (admin_sgc, gerencia, control_interno, lider_proceso),
  `distribucion.gestionar` (admin_sgc), `copias.emitir` (admin_sgc, lider_proceso), `distribucion.responder` y
  `acuses.confirmar` (los cinco roles; la condición de persona se comprueba en el servidor),
  `socializaciones.registrar` (admin_sgc, lider_proceso) y `verificaciones.realizar` (admin_sgc).
- **Reglas puras (`src/lib/distribucion/`):** `tipos.ts` (estados, etiquetas, motivos), `copias.ts`, `acuses.ts`,
  `verificacion.ts` (lista de chequeo y porcentaje), `sello-pdf.ts` (franja y QR con `pdf-lib`), `respuesta-copia.ts`,
  `periodo-acuses.ts`, `filtro-verificaciones.ts`, `hoja-excel.ts` y los tres constructores de Excel;
  `src/lib/tareas.ts` (`misTareas`, `agruparTareas`) y `src/lib/url-publica.ts`.
- **Consultas (`src/db/consultas/distribucion/`):** `puntos-uso`, `listas`, `audiencia`, `copias`,
  `eventos-copia`, `version-vigencia` (`alDejarDeSerVigente`: el único enganche de lo que depende de que una versión
  deje de ser vigente), `acuses`, `jornadas`, `evidencias`, `verificaciones`, `verificaciones-resumen`, `hallazgos`,
  `tareas` y `vencimientos`. Acciones en `src/app/acciones-distribucion.ts`, `src/app/admin/acciones-puntos-uso.ts`
  y `acciones-listas.ts`. Componentes en `src/componentes/distribucion/`.
- **Alcance de la ficha y del trámite:** el bloque **Copias controladas** (con acuses y socialización) en las fichas
  del portal y del panel; la casilla «Requiere socialización» en la aceptación (y **Marca de socialización** para
  corregirla); el bloque **Distribución** del trámite publicado; el aviso de versión de `?v=`; la audiencia
  (listas y **Lectura obligatoria al ingresar al proceso**) en **Editar datos**; **Distribución** y la dirección
  pública en **Configuración documental** y **Entidad y marca**; la nota de procesos y el bloqueo al desactivar a un
  responsable en **Usuarios**.
- **Tareas, avisos y vencimientos:** `misTareas` suma recibir, recoger y reemplazar copias, confirmar lectura (agrupadas
  desde la sexta), registrar socialización, verificar y corregir hallazgo; avisos `distribucion.copia`, `.recoger`,
  `.acuse`, `.eliminado`, `.socializar`, `.hallazgo`, `.vencido` y `.escalado`; `revisarVencimientos` gana copias, acuses
  (por versión), socializaciones y hallazgos, con un aviso por jefe y sin títulos.
- **Bitácora:** 22 acciones nuevas con frase y filtro propios (`bitacora-detalle.ts`), entre ellas `copia_emitida`,
  `copia_recibida`, `acuse_lectura`, `jornada_registrada`, `jornada_anulada` y `exporto_copias`, `exporto_acuses` y
  `exporto_verificaciones`.
- **Semilla:** `src/db/semillas/distribucion-demo.ts` (dos llamadas, antes y después de los trámites), dos usuarios nuevos y
  `usuario_procesos` para todos. La mínima añade las claves de configuración con `url_publica` vacía.
- **Verificado al cierre:** `npm run lint` limpio; **3568/3568 tests** (151 archivos, con `SEMILLA_RECIEN=1`; línea base
  de la 13A: 2971 en 124); `npm run build` sin URL de base, como el CI, con toda ruta autenticada dinámica (ƒ); compose de
  desarrollo reconstruido (`up -d --build --no-deps app`) con «Migraciones al día» y `/api/salud` `{"estado":"ok"}`; la 0006 y la
  0007 aplicadas sobre una copia de la demo de `main` (`sgc_copia`, ya borrada) sin errores, con todo `archivos` en
  `contexto = 'version'` y los tests de esquema en verde contra ella. La revisión de cada tarea (especificación y calidad) quedó
  asentada en la bitácora de ejecución. Hubo puntos de control en navegador a mitad de la fase (Tareas 6, 9 y 13, entre otras); el
  recorrido completo de §18 lo hace el controlador tras este commit.

## Hecho (Fase 13A)

Plan: `docs/superpowers/plans/2026-11-05-fase13a-flujo-documental.md`; diseño:
`docs/superpowers/specs/2026-11-05-fase13a-flujo-documental-design.md`. Los pasos 1 a 8 del
procedimiento de control de documentos del hospital quedan dentro del sistema, con la evidencia
de los puntos de control PC-01 a PC-08 (spec, Apéndice A.2).

- **Rutas nuevas:** `/tramites` (bandeja con **Por hacer**, **En curso** y **Cerrados**),
  `/tramites/nueva`, `/tramites/[id]`, `/tramites/[id]/acta`,
  `/tramites/[id]/archivos/[archivoId]/[[...nombre]]`, `POST /api/tramites/[id]/archivos`,
  `DELETE /api/tramites/[id]/archivos/[archivoId]` y `/admin/configuracion-documental`. Las URL
  existentes se conservan.
- **Esquema (`drizzle/0004_fase13a-flujo.sql`):** tablas `tramites`, `tramite_eventos`, `firmas`,
  `tramite_observaciones`, `tramite_verificaciones` y `lista_verificacion_items`;
  `tipos_documento.autoridad` y `plantilla_documento_id`; `documentos.nivel_acceso`;
  `documento_versiones.origen_aprobacion` y `publicado_en`; estado `descartado` con unicidad
  parcial del número de versión; roles de acta en `archivos`; `firma_fallo` en `accesos`. `firmas`
  y `tramite_eventos` son de solo inserción (trigger y `REVOKE` de `sgc_app`). Los datos heredados
  entran como tipos operativos, documentos generales y versiones aprobadas fuera de la plataforma.
- **Migración `drizzle/0005_fase13a-lista-e-indices.sql`:** los ocho ítems de la lista si la tabla
  está vacía (F13A-R37) e índices parciales en `auditoria` y `tramite_eventos` para
  `todosLosCodigos` y `codigoAbandonado`; esas consultas escriben las acciones en el SQL para que
  el plan genérico pueda usarlos.
- **Reglas puras (`src/lib/tramites/`):** `transiciones.ts` (tabla de §7.2 y
  `PERMISO_DE_ACCION`), `separacion.ts` (S1 a S3, candidatos, `rolAprobador`), `plazos.ts`,
  `codigo.ts` (formato, validación, consecutivo) y `tipos.ts`.
- **Flujo (`src/db/consultas/`):** `tramites-flujo.ts` (`crearSolicitud`, `transicionar`),
  `flujo/` (manejadores y validadores por etapa, `contrato.ts`), `tramites.ts` (lecturas, bandeja,
  visibilidad), `revision.ts`, `tramites-archivos.ts`, `tramites-gestion.ts`
  (`corregirDatosDeControl`), `actas.ts`, `firmas.ts`, `codigos.ts`, `parecidos.ts`,
  `config-documental.ts` y `vencimientos.ts`.
- **Firma y actas (`src/lib/`):** `firma.ts` (`verificarParaFirmar`, con el bloqueo del ingreso),
  `acta.ts` (PDF con `pdf-lib`), `texto-pdf.ts` (transliteración y aviso), `huella.ts`,
  `recepcion-archivo.ts` (recepción común de subidas), `vencimientos-disparo.ts`.
- **Visibilidad (`src/lib/alcance.ts`):** `filtroAcceso`, `puedeAccederDocumento`,
  `puedeVerVersion` y `puedeVerTramite`, usadas en ficha, procesos, búsqueda, `/api/buscar`,
  conteos del mapa, panel, Maestro y rutas de archivos. El PDF del portal lleva el nombre de quien
  descarga y la fecha en la zona de la instalación.
- **Panel:** el camino directo queda como carga de lo ya aprobado (número real de versión, marca de
  origen, descartar borrador, deshacer carga, clave `publicacion_directa`); la anulación directa
  desaparece; **Configuración documental**; autoridad y plantilla en **Tipos de documento**;
  **Procesos** vale para cualquier rol; datos de control y de catálogo separados; **Aprobación** en
  el Listado Maestro y su Excel; las acciones heredadas que se tocaron pasan a esquemas `zod`.
- **Cascarón:** entrada **Trámites**, `misTareas()` real, avisos por transición y revisión de
  vencimientos cada diez minutos como mucho, que el cascarón lanza con `after()`.
- **Semillas:** la demo adopta la convención del hospital (`CAL` → `SGC`, `FT` → `FO`, códigos
  `PROCESO-TIPO-NN`), añade `coordinadora.sgc`, dos plantillas, un restringido y cinco trámites
  sembrados con las reglas reales; la mínima trae 11 tipos con su autoridad, formato, plazos y
  ocho ítems de lista. Se resembró en las Tareas 2 y 15, en los arreglos y al cierre.
- **Manual:** capítulo 5 nuevo; capítulos 1 a 4 corregidos donde esta entrega los dejó falsos.
- **Revisión final y su ola:** la lista de verificación no puede faltar (F13A-R37); `acta_generada`
  en la bitácora; el acta dice el conteo y el nivel de los parecidos, sin códigos, también si el dato
  congelado los trae; `after()` en el cascarón; `exigirDesignacion` recibe `Cliente`;
  `ETAPAS_ABIERTAS` es una sola lista; ejecutar una eliminación compara la huella de `aprobo` con el
  principal de la vigente.
- **Adición del 2026-11-06: acta con formato y criterios que no cumplen** (spec
  `2026-11-06-fase13a-acta-con-formato-y-criterios-design.md`, plan del mismo nombre). Sin migración
  ni dependencias nuevas.
  - **Formato del acta:** `src/lib/membrete-acta.ts` (¿sirve el PDF?), `src/db/consultas/formato-acta.ts`
    (documento elegido, estado `sin_formato`, `listo`, `no_sirve` o `perdido`, lectura con huella) y
    `generarActa(datos, membrete)` en `src/lib/acta.ts`: dibuja cada hoja sobre el PDF y respeta los
    espacios. Sin formato, los mismos bytes de antes. Claves de `configuracion`:
    `formato_acta_documento_id`, `formato_acta_margen_superior_cm` y `formato_acta_margen_inferior_cm`
    (5,5 y 3,5 por defecto). El formato se congela en `detalle.acta.formato` al cerrar el trámite y
    `asegurarActa` regenera sobre ese archivo y esa huella; si falta, `acta_no_regenerable` con
    `motivo: formato` y el enlace reintenta. **Ver acta de ejemplo:** `GET /admin/api/acta-ejemplo`
    (`tramites.gestionar`, con límite de ritmo).
  - **Criterios que no cumplen:** `criteriosNoCumplen` y `huellaDeCriterios`
    (`src/db/consultas/revision.ts`, `src/lib/tramites/criterios.ts`). Un no crítico en «No cumple»
    exige nota de al menos 5 caracteres (sin contar espacios) y la confirmación con huella de quien
    revisa y de quien aprueba (`confirmaNoCumple`); un crítico bloquea también si se volvió crítico
    durante la ronda. La constancia queda en `detalle` de `concepto_favorable` y `aprobar`, y el acta
    la imprime. `AvisoCriterios` pinta el recuadro y la casilla en los dos diálogos.
  - **Quién ve el acta:** quien ve la versión o ve el trámite cerrado (`/tramites/[id]/acta` y la
    página del trámite); el archivo de una versión obsoleta sigue pidiendo el permiso de historial.
  - **Demo:** `SGC-FO-06` (PDF ficticio de la semilla, `formato-acta-demo.ts`) elegido con 4,2 y 3,2
    cm antes de los trámites; SOL-2026-001 acepta un criterio con su nota.
  - **Bitácora:** `acta_no_regenerable` se rotula «No se pudo generar un acta» (cubre también la
    primera generación).
  - **Navegador, sobre una copia con el formato real del hospital:** formato registrado y elegido
    con 5,5 y 3,5 cm; acta de ejemplo de dos hojas sin que el texto pise el encabezado ni el pie;
    trámite con dos y con tres criterios (notas de 1900 caracteres) publicado con las dos
    confirmaciones, y acta de tres hojas legible; diálogo de 390 px que se desplaza; clave errada que
    conserva la casilla y el concepto; quien aprobó una versión obsoleta abre el acta y el archivo da
    404. Copia de la base y del almacén borradas.
- **Verificación al cierre:** lint limpio; 2824/2824 tests en 121 archivos; build como el CI; compose con
  «Migraciones al día» y `/api/salud` `{"estado":"ok"}`. Sobre una copia con la demo de `main`, la
  0005 pasa la lista de 0 a 8 ítems (3 críticos), conserva una lista ya ajustada y no cambia datos en
  `sgc`; aplicadas en una sola corrida, la 0004 y la 0005 dejan 6 migraciones. Con 300 000 filas en
  `auditoria`, `todosLosCodigos` usa el índice sin apagar `seqscan`: 3,3 ms frente a 44,9 ms sin él.
  Antes, sobre la misma demo (28 documentos y 29 versiones), la 0004 dejó 5 migraciones y los datos
  intactos: todas las
  versiones con origen `fuera`, documentos generales, tipos operativos, `patron_codigo` conservado,
  y triggers y privilegios de `sgc_app` correctos en `firmas` y `tramite_eventos`. La segunda corrida
  no cambió nada.

## Hecho (Fase 12)

Plan: `docs/superpowers/plans/2026-11-04-fase12-estructura-visual.md`; diseño de detalle:
`docs/superpowers/specs/2026-11-04-fase12-estructura-visual-design.md`.

- **Rutas:** `(portal)` y `admin/(panel)` pasan a un solo grupo `src/app/(app)` (el panel
  en `(app)/admin/(panel)`, con su layout de guard sin cromo); las URL no cambian; se
  retira `admin/ingreso/page.tsx` (el proxy redirige); acciones y handlers del panel se
  quedan en `src/app/admin/`. Rutas nuevas: `/api/buscar` (con sesión, 60/min por
  usuario, 8 resultados vigentes), `/admin/api/entidad/logo` (`POST`/`DELETE`, permiso
  `entidad.administrar`, `Origin`, `Content-Length` acotado, 10/min), `/marca/logo`
  (pública, `nosniff`) y `/admin/entidad`. `src/app/(app)/not-found.tsx` y
  `src/app/not-found.tsx` (404 dentro y fuera del cascarón).
- **Esquema (`drizzle/0003_fase12-visual.sql`):** `usuarios.tema` con CHECK
  (`claro`, `oscuro`, `sistema`; por defecto `claro`), tabla `notificaciones` (FK
  RESTRICT a usuarios, índice por usuario, leída y fecha), índice único
  `usuarios_usuario_lower_unico` sobre `lower(usuario)`; claves de configuración
  `sigla_entidad`, `color_primario`, `color_secundario`, `logo_ruta`, `logo_mime`,
  `logo_version`. Comprobación previa de duplicados (`src/db/duplicados-usuario.ts`) en
  `scripts/arrancar.ts` y en `npm run db:migrate`, que ahora es `scripts/migrar.ts`.
- **Color y marca (`src/lib`):** `color.ts` (hex, OKLCH en JS puro, ajustes de
  luminosidad que conservan el tono), `marca.ts` (`derivarMarca` para los dos temas,
  `validarMarca` con P1/P2, sugerencias, `formatearRazon`), `tema.ts` (`TEMAS`,
  `COOKIE_TEMA`, `temaEfectivo`), `logo.ts` + `logo-limites.ts` (`validarLogo`: magic
  bytes, 1 MB, 64–2048 px con lector propio de PNG, JPEG y WebP), `tareas.ts`
  (`misTareas`, hoy `[]`), `busqueda-rapida.ts`, `marcas-busqueda.ts`, `version.ts`.
- **Consultas:** `src/db/consultas/entidad.ts` (`obtenerMarca` cacheada por petición,
  `obtenerMarcaSegura`, `obtenerEntidad`, `guardarEntidad`, `guardarLogo`, `quitarLogo`,
  `obtenerLogoAlmacenado`) y `notificaciones.ts` (`crearNotificacion`, `contarNoLeidas`,
  `listarRecientes`, `marcarLeida`, `marcarTodasLeidas`, solo filas propias).
  `CLAVES_TEXTO` del mapa queda con subtítulo, PHVA y patrón de código.
- **Estilos (`src/app/globals.css`):** tokens de tres capas con `light-dark()`
  (superficies, texto, módulo, estado con fondo y texto AA en los dos temas), marca
  inyectada como `style` en `<html>` desde el layout raíz con `data-tema`, variante
  `dark:` sobre el atributo, alias heredados `azul`/`verde`, utilidades `banda-*` (con
  `banda-solido`) y `--formato-*`, impresión siempre en claro. `--radius` 0,5 rem.
- **Cascarón (`src/componentes/cascaron`):** `Cascaron`, `BarraLateral`,
  `ContenidoBarra`, `BarraSuperior` (cajón móvil con `Dialogo`), `Buscador` (paleta
  `combobox`/`listbox`), `Campana` y `MarcarTodasLeidas` (con `<details>`, sin JS
  propio), `MenuUsuario` (Mi cuenta, tema con radios y Salir), `Monograma`,
  `PantallaCentrada`, `navegacion.ts` (fuente única de la barra y de "Ir a"). Se retiran
  `EncabezadoSitio`, la cabecera "Administración SGC" y `enlaces-panel.ts`.
- **Componentes base (`src/componentes/ui`):** `EncabezadoPagina`, `TablaDatos`,
  `Insignia` (reemplaza `EstadoBadge`), `TarjetaCifra`, `EstadoVacio`, `Boton`, `Campo`,
  `Dialogo` y `GraficoBarras` (movido desde estadísticas).
- **Pantallas:** Inicio con **Mis tareas** y el mapa; **Entidad y marca**
  (`FormularioEntidad`, `VistaPreviaMarca`, `CargaLogo`, acción `guardarEntidadAccion`
  en `src/app/admin/acciones-entidad.ts`); **Textos del mapa y código de documentos**;
  las 46 páginas dentro del cascarón con `EncabezadoPagina`, listas del panel con
  `TablaDatos`, estadísticas con `TarjetaCifra`, colores fijos de Tailwind cambiados por
  tokens, ningún texto fijo de la entidad (el título, el ingreso, el Excel y la impresión
  del Listado Maestro toman la marca). Acciones nuevas en `acciones-cuenta.ts`:
  `cambiarTemaAccion`, `marcarNotificacionLeidaAccion`,
  `marcarNotificacionesLeidasAccion`.
- **Permisos:** `entidad.administrar` (solo `admin_sgc`) con su celda en
  `tests/permisos.test.ts`.
- **Semillas:** la mínima y la demo traen sigla y colores; la demo, el logo demo
  (`src/db/semillas/recursos/logo-demo.png`, generado con `scripts/generar-logo-demo.mjs`)
  y una bienvenida por usuario; `limpiarTodo` vacía `notificaciones`.
- **Tests:** de 586 (59 archivos) a **1481 (83)**. Nuevos: `color`, `marca` (malla de
  180 colores), `tokens`, `contraste-panel`, `tema`, `logo`, `entidad`,
  `esquemas-entidad`, `notificaciones`, `notificaciones-acciones`, `tareas`,
  `duplicados-usuario`, `buscador-rapido`, `navegacion`, `cascaron`, `inicio`,
  `ui-base`, `ui-dialogo`, `mapa-oscuro`, `migracion-listas`, `proxy-redirecciones`,
  `sin-main`, y los estructurales `textos-fijos` y `colores-fijos`; ajustados
  `paginas-sesion`, `handlers-permisos`, `proxy-matcher`, `permisos`, `esquema`,
  `a11y-estructura`, `mapa-admin` y otros. La ola final de arreglos la llevó a
  **1662 (85)**: nuevos `cascaron-desplegables` y `dockerignore`; `duplicados-usuario`
  pasa a probar la comprobación contra la BD y `colores-fijos` revisa el hex de la marca.
- **Documentos:** manual de usuario, capítulos 3 y 4, y ajustes en el 1 y el 2;
  `AGENTS.md` (cascarón y componentes base, tema y tokens, la entidad como configuración,
  rutas públicas, excepción a la regla 5, tests que no dejan la base inservible);
  `README.md`.

## Hecho (Fase 11)

Plan: `docs/superpowers/plans/2026-11-03-fase11-fundacion-acceso.md`; diseño de detalle:
`docs/superpowers/specs/2026-11-03-fase11-fundacion-acceso-design.md`.

- **Dependencias:** Next 16.2.10 → **16.4.5** (y `eslint-config-next`); `zod` 4,
  `otpauth`, `qrcode` (JS puro); `shadcn` pasa a `devDependencies` (F11-D25).
- **Esquema (`drizzle/0002_fase11-acceso.sql`, `src/db/esquema.ts`):** `usuarios` con
  rol (CHECK en los cinco roles), correo único sin distinguir mayúsculas, cargo, jefe
  inmediato, `debe_cambiar_clave`, contadores y fin de bloqueo, secreto TOTP cifrado,
  `ver_historial`, `acepto_datos_en`; tablas `areas`, `cargos` (superior
  autorreferido), `usuario_procesos`, `accesos`, `codigos_recuperacion`; `sesiones` con
  último uso, factor pendiente, IP y navegador; `eventos_consulta.usuario_id`; todo
  usuario previo pasa a `admin_sgc`; función `sgc_impedir_modificacion()` y triggers
  `auditoria_inmutable`/`accesos_inmutable`; FK de `auditoria` y `accesos` a usuarios en
  `RESTRICT`.
- **Roles de BD y arranque:** `src/db/roles-bd.ts` (`asegurarRolApp`: crea o sincroniza
  `sgc_app` con la clave por `set_config`, sin concatenarla, y aplica GRANT/REVOKE y
  privilegios por defecto), `scripts/asegurar-rol-app.ts` (`npm run db:roles`),
  `src/lib/arranque.ts` (`decidirConexiones`, modo heredado),
  `scripts/arrancar.ts` (esperar BD → migrar → rol → admin; `APP_SECRETO` obligatorio en
  producción), `src/db/cliente.ts` (`TIPOS_SQL`: `int8` como número), `drizzle.config.ts`
  con la conexión del migrador.
- **Reglas de cuenta (`src/lib`):** `roles.ts` (roles, etiquetas, `EXIGIR_2FA_ROLES`),
  `permisos.ts` (matriz, `puede`, `requerirPermiso`, `puedeEntrarAlPanel`,
  `alcanceMaestro`), `alcance.ts` (`alcanceProcesos`, `procesosAsignados`),
  `bloqueo.ts` (5 fallos, 15 min ×2 hasta 24 h), `clave-politica.ts` + `datos/claves-
  comunes.json` (12–128, NFKC, lista común, sin el usuario; clave temporal
  `XXXX-XXXX-XXXX-XXXX`; generada por `scripts/generar-claves-comunes.mjs`), `totp.ts`
  (otpauth, ±1 periodo, 8 códigos de recuperación con SHA-256), `cifrado.ts`
  (AES-256-GCM con `APP_SECRETO`), `cuenta-estado.ts` (orden de pasos pendientes:
  factor > clave > aviso > TOTP obligatorio), `candado.ts` (cola en memoria por cuenta),
  `ip.ts` (`CONFIAR_PROXY`, `net.isIP`), `origen.ts` (`origenValido`), `rutas.ts`
  (`rutaInterna`), `validacion.ts` (`parsearFormulario` con `omitir`, zod en español),
  `celdas.ts` (`neutralizarFormula`), `esquemas/{cuenta,usuarios,estructura}.ts`.
- **Sesión y guard:** `src/lib/sesion.ts` (rol y marcas en `SesionValida`, factor
  pendiente, inactividad, cierre masivo, `listarSesionesActivas`), `sesion-actual.ts`
  (`requerirSesion` con `permitirPendientes`, `sesionDePeticion`), `paginas.ts`
  (`exigirSesion`, `exigirSesionConPendientes`, `exigirPermiso`, `exigirEntradaPanel`),
  `src/proxy.ts` (protege todo salvo `/ingreso` y `/api/salud`; 401 JSON en `/api` y
  `/admin/api`; `volver`; cabecera `x-sgc-ruta`; matcher con `[.]`).
- **Ingreso y cuenta:** `src/lib/ingreso.ts` (`intentarIngreso`, `intentarFactor`, sin
  oráculo, bajo candado), `src/lib/segundo-factor.ts` (activar con clave + código,
  desactivar con clave), `src/app/acciones-cuenta.ts` (ingresar, verificar, salir, clave
  inicial, aviso, cambio de clave, TOTP), `src/db/consultas/{autenticacion,perfil}.ts`;
  páginas `src/app/ingreso/{page,verificar/page}.tsx`, grupo `src/app/(cuenta)/`
  (`/cuenta`, `/cuenta/clave-inicial`, `/cuenta/segundo-factor`, `/aviso-datos`) y
  componentes `src/componentes/cuenta/` (formularios, `PanelSegundoFactor` con QR PNG y
  códigos, `MenuUsuario` en el encabezado). `/admin/ingreso` redirige a `/ingreso`.
- **Portal:** las páginas públicas pasan al grupo `src/app/(portal)/` (las URL no
  cambian), cada una con `exigirSesion()`; `/sin-acceso`; bloque `MisProcesos` en el
  inicio para líderes; `eventos_consulta` y búsqueda con usuario; límites de búsqueda y
  archivos por usuario.
- **Panel:** `src/app/admin/comun.ts` (`mutacion(formData, permiso, fn)`,
  `comprobarLimite`, `idNumerico`), `src/componentes/admin/enlaces-panel.ts`
  (navegación por permiso), layout con `exigirEntradaPanel`; cada página con
  `exigirPermiso`; handlers con `sesionDePeticion` + `puede` y `Origin` en el DELETE de
  archivos; maestro "todos" solo con `ver_historial`.
- **Usuarios y estructura:** `src/db/consultas/{usuarios,estructura,accesos}.ts`,
  `src/app/admin/{acciones-usuarios,acciones-estructura}.ts`, `src/lib/lote-usuarios.ts`
  (plantilla y resultados CSV con BOM y `;`, 500 filas, validación por fila); páginas
  `/admin/usuarios` (lista con filtros y aviso de un solo admin), `/nuevo`, `/[id]`
  (editar, desactivar, desbloquear, restablecer, quitar 2FA, autoprotección),
  `/lote` y `/lote/plantilla`, `/admin/estructura` (áreas con ↑↓ y cargos con superior,
  sin ciclos), `/admin/accesos` (filtros, 50 por página), `/admin/sesiones` (cierre
  forzado); componentes `src/componentes/admin/{usuarios,estructura}/`
  (`ClaveTemporal` muestra la clave una vez). `src/lib/bitacora-detalle.ts` con frases
  para las acciones nuevas.
- **Semillas:** `src/db/semilla.ts` despacha `src/db/semillas/demo.ts` (mapa,
  documentos, 5 áreas, 9 cargos, 5 usuarios demo) y `minima.ts` (`--minima`).
- **Ola final de arreglos de la revisión de la rama:** clave inicial distinta de la
  temporal (F11-D31), rescate por entorno que devuelve una cuenta de administración
  usable (F11-D32), cargo ambiguo del lote rechazado y forma `Área > Cargo` (F11-D33),
  nunca cero Admin SGC activos (F11-D34). Menores: el Listado Maestro (página, Excel y
  nombre del archivo) fecha en `ZONA_HORARIA` (`fechaHoraLocal`, `fechaCompactaLocal`) y
  ya no queda ningún `toISOString()` que se muestre al usuario; `?motivo=` de `/ingreso`
  y `?aviso=` de `/cuenta` con `mensajeDeParametro` (`Object.hasOwn`); `/api/salud`
  responde solo `{ estado: "ok" | "error" }` (versión y error del driver al log); el
  arranque avisa si la app conecta con otro rol que `sgc_app` teniendo `BD_APP_CLAVE`
  (`avisoRolApp`, solo aviso); quitar el segundo factor a otra persona cierra todas sus
  sesiones; comentarios en `roles-bd.ts` (tablas inmutables futuras) y junto a
  `BotonRestablecer` (por qué conserva la clave temporal).
- **Tests:** de 205 a **586**. Nuevos: `permisos`, `roles`, `alcance`, `bloqueo`,
  `clave-politica`, `totp`, `cifrado`, `cuenta-estado`, `candado`, `ip`, `origen`,
  `rutas`, `validacion`, `sesion-actual`, `ingreso`, `autenticacion`,
  `segundo-factor`, `perfil`, `estructura`, `usuarios`, `lote-usuarios`, `accesos`,
  `privilegios-bd`, `cliente`, `proxy-matcher`, `handlers-permisos`, `archivos-origen`,
  `clave-inicial`, `salud` y los estructurales `acciones-permisos` y `paginas-sesion`; los heredados (`guardia`,
  `publicar`, `esquema`, `descarga-estampada`, `bitacora`, `mapa-admin`, `sesion`…)
  reescritos para sesión y rol.
- **Documentos:** `AGENTS.md` reescrito para el piso nuevo; manual de usuario, capítulos
  1 y 2 (`docs/manual/usuario/`); `README.md` y `.env.example` al día.

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

- [x] **Convención de códigos**: resuelta el 2026-11-05: sigla del proceso, sigla del tipo y
  consecutivo de dos dígitos contado por proceso y tipo (`SGC-FO-02`). La implementó la 13A.
- [ ] **Documentos reales**: aún no están aprobados ni numerados. Hasta entonces, seed
  con documentos ficticios verosímiles. No hay migración en lote comprometida.
- [ ] Logo institucional en mejor resolución, si existe. Desde la Fase 12 se sube en
  Entidad y marca como PNG, JPG o WebP (no SVG): idealmente PNG cuadrado de unos 512 px
  con fondo transparente.
- [ ] **Formato del informe de la revisión anual** (13C): registrar el PDF propio (con el código SGC-RG-06 si se
  quiere en el encabezado) y elegirlo en Configuración documental antes del primer cierre real; ajustar los tres textos
  del procedimiento de la 13C (manual, capítulo 7, sección 7) y tratar la carga inicial vencida (capítulo 7, sección 6.1).
- [ ] **Indicadores** (14A): cargar las fichas reales (el Excel `INDICADORES_PROCESO_SGC_OK.xlsx` trae las ocho del SGC),
  con su meta, sus responsables y su inicio de medición, y decidir la regla del cambio mayor a una periodicidad más
  gruesa (F14A-R15).

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

## Decisiones adicionales (Fase 11)

F11-D1 a F11-D10 vienen del diseño de detalle de la fase. Las demás son resoluciones del
controlador durante la ejecución; varias corrigen el diseño o el plan y mandan sobre
ellos. La bitácora de la fase que las numeraba como "Rn" no se conserva: los "(Rn)" de
esta tabla quedan solo como equivalencia, porque algunos tests los citan en sus nombres
(`tests/bloqueo.test.ts`, `tests/ingreso.test.ts`, `tests/segundo-factor.test.ts`).

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| F11-D1 | **Dos roles de BD** (`DATABASE_URL_MIGRADOR` dueño del esquema; `DATABASE_URL` con `sgc_app`, solo DML, sin `UPDATE`/`DELETE` en `auditoria` y `accesos`, sin DDL ni `TRUNCATE`) con **modo heredado**: sin `DATABASE_URL_MIGRADOR` todo corre con `DATABASE_URL` y el arranque avisa; sin `BD_APP_CLAVE` se omite el rol. **No hay migración 0003** (R3): `asegurarRolApp` crea o sincroniza el rol y aplica todos los privilegios de forma idempotente, en una transacción, en cada arranque **después** de migrar; `db:preparar` = `db:migrate` + `db:roles` | Spec §5.9 (mínimo privilegio). El modo heredado deja arrancar una base restaurada de `sgc-suaza` sin variables nuevas; un GRANT en una migración fallaría en ese modo (el rol no existe) y los REVOKE exigen las tablas ya migradas | 2026-11-03 |
| F11-D2 | **Bitácora inmutable sin puerta trasera:** `sgc_impedir_modificacion()` + triggers `BEFORE UPDATE OR DELETE` en `auditoria` y `accesos` que frenan también al dueño. Las FK de usuario en esas tablas pasan a `ON DELETE RESTRICT` (R2): los usuarios con historia se desactivan, nunca se borran; los tests no limpian auditoría y usan nombres únicos por corrida (`zz_<algo>_${Date.now()}`) que no se borran | ISO 7.5.3.2 y spec §5.1 ("se desactivan, nunca se borran"). Un `SET NULL` sería un UPDATE que el trigger rechaza. Los triggers de fila no frenan `TRUNCATE`: las semillas vacían como dueño; `sgc_app` no tiene `TRUNCATE` | 2026-11-03 |
| F11-D3 | **`sesionDePeticion(peticion)`** para route handlers: lee la cookie del `NextRequest` y devuelve null ante sesión inválida o con cualquier paso pendiente | Los handlers se prueban pasando la cookie en la petición, sin `cookies()` de Next | 2026-11-03 |
| F11-D4 | ~~Mostrar la hora de desbloqueo solo con la clave correcta~~ **Reemplazada por F11-D13 (R19):** no hay mensaje de bloqueo | El diseño original dejaba un oráculo: con la cuenta bloqueada se podía seguir probando claves y distinguir la correcta | 2026-11-03 |
| F11-D5 | **Límites por usuario** (búsqueda 30/min, archivos del portal 60/min, mutaciones 60/min, subida 30/min) y **por IP solo con proxy de confianza**. Ingreso (R23): 30/min por IP conocida; con IP desconocida (sin `CONFIAR_PROXY`), un balde compartido de 120/min | Todo el hospital puede salir por una sola IP: el control fino es por cuenta (bloqueo). El balde compartido protege la CPU de Argon2 aunque no se conozca la IP | 2026-11-03 |
| F11-D6 | **QR del TOTP como PNG en `data:` URL** (`qrcode`), nunca SVG inyectado | La CSP vigente ya permite `img-src data:`; un SVG en el DOM es superficie de XSS | 2026-11-03 |
| F11-D7 | **`tokens_un_uso` se pospone a la Fase 16** | Sin SMTP no tiene consumidor (activación y restablecimiento por enlace) | 2026-11-03 |
| F11-D8 | **Next a la última 16.x** (16.4.5 al cerrar), no 16.3.x como decía el spec | Mismo major y misma intención: no escribir código nuevo sobre una versión con avisos de seguridad | 2026-11-03 |
| F11-D9 | **Grupos de rutas `(portal)` y `(cuenta)`**; `/ingreso` público y `/admin/(panel)`; las URL no cambian. **Cada página llama ella misma** `exigirSesion`/`exigirPermiso`/`exigirSesionConPendientes` (R28), con test estructural | En Next 16 los layouts no se re-ejecutan en la navegación de cliente ni impiden que la página entre en el payload RSC: el layout solo no protege | 2026-11-03 |
| F11-D10 | **`APP_SECRETO` obligatorio en producción** (32 bytes en base64; el arranque falla sin él). Es el `SESION_SECRETO` del spec, renombrado | Cifra los secretos TOTP en reposo (AES-256-GCM); no firma sesiones (los tokens son aleatorios). En desarrollo, clave fija con aviso | 2026-11-03 |
| F11-D11 | El cliente de BD parsea `int8` como número de JS (`TIPOS_SQL`, R14) | postgres.js devolvía los ids `bigint` como texto: las comparaciones de identidad (autoprotección, `procesoIds`) fallaban en silencio. Los ids están muy por debajo de 2^53 | 2026-11-03 |
| F11-D12 | **Lista de claves comunes** desde SecLists `xato-net-10-million-passwords-1000000.txt` (MIT): solo entradas de 12 a 128 caracteres, en minúsculas, sin duplicados, por frecuencia (46 146 entradas, 767 KB, `scripts/generar-claves-comunes.mjs`); la clave se normaliza a NFKC antes de validarla (R15) | Con mínimo 12, la lista de 10 000 que nombra el diseño F11 §6 solo tenía 10 entradas útiles. El texto del diseño quedó desactualizado: manda esta decisión | 2026-11-03 |
| F11-D13 | **Bloqueo sin oráculo** (R16, R19, R20, R21, R24, R25): con la cuenta bloqueada la clave no se verifica (se calcula un hash para igualar el costo), se registra `fallo` y se responde el mismo mensaje genérico de siempre, con la pista fija "Si falló varias veces, la cuenta se bloquea temporalmente…"; los intentos durante el bloqueo no lo prolongan. Con TOTP, la clave correcta no reinicia los contadores (solo el factor confirmado); cada fallo de factor suma al mismo contador y el que bloquea cierra la sesión pendiente; sin limitador aparte por sesión. Buscar, verificar y escribir el estado van bajo un **candado en memoria por id de cuenta** (no por el texto tecleado), compartido con desbloqueo y restablecimiento | Revisión de seguridad de la Tarea 7: el mensaje con hora permitía adivinar sin límite durante el bloqueo; abrir sesiones nuevas reiniciaba el límite del factor; intentos en paralelo contaban como uno; `lower()` de Postgres y de JS difieren en Unicode | 2026-11-03 |
| F11-D14 | `rutaInterna` rechaza además caracteres de control C0 y DEL (R17); `ipDePeticion` devuelve null si el valor no pasa `net.isIP` (R18) | `"/\t/evil.com"` era una redirección abierta; una IP malformada del proxy rompía el INSERT en columnas `inet` y tumbaba el ingreso | 2026-11-03 |
| F11-D15 | Núcleos de ingreso y de factor en `src/lib/ingreso.ts` (`intentarIngreso`, `intentarFactor`), sin contexto de petición; las acciones solo ponen cookies y redirigen (R22) | Probables contra la BD, con tests de paralelismo, bloqueo y factor | 2026-11-03 |
| F11-D16 | **Completitud de la cuenta en el servidor** (R26): `requerirSesion` y `sesionDePeticion` rechazan cualquier paso pendiente (factor siempre; clave inicial, aviso y TOTP obligatorio salvo `permitirPendientes`, que solo usan los flujos de cuenta) | Antes solo los layouts aplicaban el TOTP obligatorio: un rol obligado sin activarlo podía descargar y mutar | 2026-11-03 |
| F11-D17 | Matcher del proxy con `[.]` para los puntos literales y test de comportamiento con `unstable_doesMiddlewareMatch` (R27) | Next no escapa el `.` y `\.` coincide con cualquier carácter: `/procesos/apoyo-diagnostico` quedaba fuera del proxy | 2026-11-03 |
| F11-D18 | **Reglas del segundo factor** (R29, R30, R31, R36): un rol de `EXIGIR_2FA_ROLES` no puede desactivarlo; activarlo pide la clave actual además del código; desactivar sin factor activo da error y no audita; desde el panel nadie restablece su propia clave ni quita su propio segundo factor ("Use Mi cuenta…"); crear usuario y restablecer clave (las acciones con Argon2) pasan por el límite de mutaciones | Con una sesión robada se podía inscribir un factor ajeno; el autoservicio desde el panel saltaba la confirmación de clave; no debe quedar una fila de bitácora falsa | 2026-11-03 |
| F11-D19 | **Entrada al panel con `panel.entrar` o la marca `ver_historial`** (`puedeEntrarAlPanel`, R32); quien entra solo por la marca ve únicamente Documentos en solo lectura | El diseño da la marca a líder y consulta para la lista y el detalle de documentos, pero esos roles no tienen `panel.entrar` | 2026-11-03 |
| F11-D20 | En el Listado Maestro (página y Excel), `incluir=todos` exige `documentos.ver_historial`; sin él se fuerza "vigentes" y el selector no aparece; la bitácora registra el alcance efectivo (R33) | Spec §5.3: lo no vigente es de Admin SGC, Control Interno y la marca. Gerencia pide el inventario completo a Calidad | 2026-11-03 |
| F11-D21 | `parsearFormulario(formData, esquema, { omitir })` descarta claves de ruta antes del esquema estricto; las ediciones pasan `omitir: ["id"]` (R34) | El campo oculto `id` chocaba con los esquemas `.strict()` y editar áreas y cargos fallaba siempre | 2026-11-03 |
| F11-D22 | `supervisoresDe` ignora un jefe inmediato inactivo y cae al organigrama (R35) | Un supervisor desactivado no debe recibir escalamientos (Fase 16) | 2026-11-03 |
| F11-D23 | Todo CSV que genera la app (plantilla y resultados del lote) neutraliza fórmulas con la regla de D54 (`neutralizarFormula`, R37) | El administrador abre los resultados en Excel y los nombres son texto libre | 2026-11-03 |
| F11-D24 | Áreas con funciones propias (`moverArea`, `alternarArea`) y no por el motor genérico del mapa (R4); `editarCargo` toma `LOCK TABLE cargos` contra ciclos concurrentes | El motor genérico saltaba la regla "área con cargos activos" y abría las áreas a las acciones genéricas por formulario manipulado | 2026-11-03 |
| F11-D25 | `shadcn` pasa a `devDependencies` (R12); se aceptan 3 advertencias altas transitivas de `npm audit --omit=dev` sin `--force` (R13) | `shadcn` solo se usa como `@import` CSS en build y arrastraba express/undici a producción. Las altas restantes no se alcanzan con entrada del usuario (ver Deuda técnica) | 2026-11-03 |
| F11-D26 | Extras de los implementadores aceptados en revisión: el proxy reenvía la ruta pedida en la cabecera `x-sgc-ruta` (siempre sobrescrita) para que el aviso de datos devuelva a ella; verificar la clave actual (cambio de clave, activar o desactivar el TOTP) tiene un límite de 10 intentos por 15 minutos por usuario; la clave nueva debe ser distinta de la actual | Conservar `volver` a través de los pasos obligatorios; con una sesión robada no se debe poder adivinar la clave actual desde Mi cuenta | 2026-11-03 |
| F11-D27 | **Toda acción de `src/app/acciones-cuenta.ts` que cambia el estado de la sesión o de la cuenta llama `revalidatePath("/", "layout")` antes de `redirect`** (ingresar, verificar el factor, salir, clave inicial, aviso, cambio de clave, iniciar y desactivar el TOTP; confirmar el TOTP no redirige pero también revalida al activarse); lo exige `tests/acciones-cuenta-cache.test.ts` (R39, commit `d79e9d4`) | En producción la caché del enrutador del cliente reutilizaba la precarga de `/` hecha antes de cambiar la clave y causaba un bucle `/` ↔ `/cuenta/clave-inicial`. En desarrollo no se ve: solo aparece con la imagen de producción | 2026-11-03 |
| F11-D28 | **Códigos de recuperación: `PanelSegundoFactor` envuelve todas las ramas de `/cuenta/segundo-factor`** (sin secreto, secreto pendiente, activo, error de descifrado) como único elemento raíz, con `confirmar` y `children`; lo exige `tests/segundo-factor-panel.test.ts` | `confirmarTotpAccion` revalida el layout (F11-D27) y la página pasaba a la rama «activo», desmontando el panel y perdiendo los códigos (estado de `useActionState`). Con el panel montado en todas las ramas React conserva el estado. Ninguna otra acción de `acciones-cuenta.ts` revalida sin redirigir | 2026-11-03 |
| F11-D29 | **`ZONA_HORARIA` cableada** (defecto `America/Bogota`): la conexión de la app abre con `TimeZone = zonaHoraria()` y los `Intl.DateTimeFormat` usan el helper; zona inválida = el arranque falla | Bitácora mostraba UTC y Accesos Bogotá para el mismo instante, y los filtros por fecha y las estadísticas por día cortaban en UTC. Con el TimeZone de la sesión de BD ninguna consulta fija zona | 2026-11-03 |
| F11-D30 | Ajustes menores del recorrido final: la auditoría del lote de usuarios cuenta las filas rechazadas por el CSV (`crearUsuariosEnLote(filas, actorId, rechazadasAntes)`); al quitar el 2FA de otra persona la bitácora la nombra (`detalle.usuario`); «Mis procesos» va dentro de `<main>` | Hallazgos del recorrido de demostración | 2026-11-03 |
| F11-D31 | **La clave inicial no puede ser la temporal:** `fijarClaveInicial` (`src/lib/clave-inicial.ts`, sin contexto de petición; `claveInicialAccion` delega) aplica la política y después verifica la clave nueva contra el hash actual de la cuenta; si coincide, rechaza con «La clave nueva debe ser distinta de la clave temporal.» | La temporal también la conoce el administrador que la generó: si queda como definitiva, el «quién» de la bitácora deja de ser de una sola persona (spec §5.9: claves temporales de un solo uso). Revisión final de la rama, I1 | 2026-11-03 |
| F11-D32 | **El rescate por entorno devuelve una cuenta de administración usable:** `asegurarAdmin` con `forzarClave` (`ADMIN_FORZAR_CLAVE=1` o `admin:asegurar -- --forzar-clave`), en una transacción, pone además `rol = 'admin_sgc'` y `activo`, quita el segundo factor sin condición (`totp_activo`, secreto y `codigos_recuperacion`), cierra todas las sesiones y deja fila `restablecimiento` en `accesos` (IP y navegador nulos). Sin `forzarClave` no cambia nada. `asegurarAdmin` busca la cuenta con `lower(usuario)` y crea el usuario en minúsculas (parte de M9; el índice queda en la Deuda técnica) | Es el único camino de recuperación sin tocar la BD a mano. Si la cuenta del bootstrap se había bajado a `consulta`, o tenía TOTP con el teléfono y los códigos perdidos, el rescate devolvía una cuenta que no administraba o que seguía pidiendo el código. Revisión final, I2 | 2026-11-03 |
| F11-D33 | **El lote no asigna en silencio un cargo ambiguo:** `catalogoDeCargos` (`src/lib/lote-usuarios.ts`, lo usa `crearLoteAccion`) indexa cada cargo por nombre y por área + nombre, normalizados, y marca `ambiguo` la clave que se repite; la columna `cargo` acepta `Área > Cargo`; un nombre que existe en varias áreas se rechaza con «El cargo «X» existe en varias áreas; escríbalo como Área > Cargo». La página del lote lista los cargos como `Área > Cargo` | Los cargos son únicos por `(area_id, nombre)`, no por nombre: el `Map` por nombre se quedaba con el último y la fila nacía con el área y el supervisor equivocados, sin error. Revisión final, I3 | 2026-11-03 |
| F11-D34 | **Nunca cero Admin SGC activos:** `editarUsuario` (si el rol nuevo no es `admin_sgc`) y `cambiarActivo` (al desactivar) llaman, dentro de su transacción, `exigirOtroAdminActivo(tx, id)`, que bloquea con `FOR UPDATE` y en orden de id las filas de los Admin SGC activos **antes** de bloquear la fila del usuario y rechaza con «Debe quedar al menos un Administrador del SGC activo.» si `id` es el último | Dos administradores que se bajaban mutuamente dejaban la instalación sin ninguno. Bloquear el conjunto antes que la fila propia evita que esos dos cambios simultáneos se interbloqueen. Con uno solo sigue el aviso, sin bloquear (spec). Revisión final, M10 | 2026-11-03 |

## Decisiones adicionales (Fase 12)

F12-DC1 a F12-DC24 vienen del diseño de detalle de la fase (§17), con su número de allí;
el detalle está en ese documento. Desde F12-D25, las resoluciones de producto del
controlador durante la ejecución; varias corrigen el diseño o el plan y mandan sobre
ellos. La bitácora de la ejecución que las numeraba como "Rn" vive fuera del repositorio
(`.superpowers/`): los "(Rn)" quedan solo como equivalencia. Las resoluciones de proceso
(orden de las tareas, anidación interina de `<main>`, resiembra de la Tarea 4, higiene de
los tests) no entran; la de los tests quedó como regla en `AGENTS.md`. Base: **ISO**
(cláusula de 9001:2015), **Regulación** o **Práctica**.

| # | Decisión | Porqué | Fecha |
|---|---|---|---|
| F12-DC1 | Un solo grupo `(app)` con el cascarón; `(portal)` desaparece y `admin/(panel)` se mueve dentro | Un layout compartido conserva la barra lateral al navegar; dos árboles la remontan. Práctica | 2026-11-04 |
| F12-DC2 | `admin/ingreso/page.tsx` se elimina | El proxy ya redirige a `/ingreso`; la página era redundante. Práctica | 2026-11-04 |
| F12-DC3 | Las migas se quedan en la página, no en la barra superior | Evita un canal página → layout en el cliente. Práctica | 2026-11-04 |
| F12-DC4 | Barra lateral por módulos (Documentos, Administración); desaparecen la cabecera "Administración SGC" y "Ver portal público" | El color de módulo dice dónde está la persona (spec maestro §5.11); ya no hay portal público. Práctica | 2026-11-04 |
| F12-DC5 | Los módulos de fases futuras no aparecen hasta existir | Un enlace muerto confunde a un funcionario. Práctica | 2026-11-04 |
| F12-DC6 | Tema por defecto `claro`; `data-tema` escrito por el servidor; "sistema" por media query; sin script | La dirección C es clara; sin destello y sin `unsafe-inline` nuevo. Práctica | 2026-11-04 |
| F12-DC7 | La variante oscura de la marca se deriva; el administrador no configura colores oscuros | Un administrador de hospital no debe calibrar ocho colores. Práctica | 2026-11-04 |
| F12-DC8 | P1 (primario ≥ 4,5:1 con blanco) y P2 (secundario ≥ 3:1 sobre el fondo) al guardar, con sugerencia del tono más cercano que pasa | Spec maestro §5.10 pide rechazar; la sugerencia evita el ensayo y error; P1 deja seguros los `text-white` heredados sobre la marca. Práctica (WCAG 2.1 AA, 1.4.3 y 1.4.11) | 2026-11-04 |
| F12-DC9 | Logo sin recodificar: magic bytes (PNG, JPEG, WebP; nunca SVG), 1 MB, 64–2048 px; `/marca/logo` público con `nosniff` | Sin `sharp`; una imagen servida con su MIME y `nosniff` no ejecuta nada (spec maestro DC19). Práctica (seguridad) | 2026-11-04 |
| F12-DC10 | Alias `azul`/`verde` a los tokens de marca y `text-azul` → `text-marca` mecánico; el resto del renombrado en la Fase 19 | 45 archivos toman la marca con un solo cambio; los enlaces siguen legibles en oscuro. Práctica | 2026-11-04 |
| F12-DC11 | Tintes del mapa mezclados con la superficie y clase `banda-texto` | Funcionan en oscuro y dejan de repetir el `color-mix`. Práctica | 2026-11-04 |
| F12-DC12 | `notificaciones` nace ahora con `crearNotificacion`; la demo siembra una bienvenida | DC21 del spec maestro; la campana se demuestra con datos reales. Práctica | 2026-11-04 |
| F12-DC13 | `misTareas` devuelve `[]` con el tipo definitivo | La Fase 13 solo añade fuentes. Práctica | 2026-11-04 |
| F12-DC14 | `/api/buscar`: 8 resultados, 60/min por usuario, solo vigentes como `/buscar` | Reutiliza `buscarDocumentos`; la visibilidad de lo no vigente por rol es de la Fase 13. ISO 7.5.3 (solo la versión vigente en circulación) | 2026-11-04 |
| F12-DC15 | "Textos institucionales" se parte en Entidad y marca / Textos del mapa | Nombre, lema y aviso son de la entidad, no del mapa. Práctica | 2026-11-04 |
| F12-DC16 | Comprobación previa de duplicados antes de la migración 0003 | Una base heredada con `admin` y `Admin` no debe dejar el contenedor en bucle de arranque. Práctica | 2026-11-04 |
| F12-DC17 | Componentes propios con HTML nativo y `<dialog>`; shadcn solo como hoja base | Menos capas; `<dialog>` resuelve foco y Escape. Práctica | 2026-11-04 |
| F12-DC18 | Listas e insignias migran; los formularios conservan su marcado (Fase 19) | Donde más se ve el sistema con menos riesgo. Práctica | 2026-11-04 |
| F12-DC19 | Pie de la barra lateral "SGC Integral · v<versión>" | Decisión 2 del usuario: el producto, solo en el pie y en el ingreso | 2026-11-04 |
| F12-DC20 | Permiso nuevo `entidad.administrar` (solo `admin_sgc`) | La marca es de la entidad, no del mapa; mínimo privilegio. Práctica | 2026-11-04 |
| F12-DC21 | Título «<nombre> · SGC», plantilla «%s · <sigla>» | La pestaña identifica a la entidad, como decidió el usuario | 2026-11-04 |
| F12-DC22 | `--radius` baja a `0.5rem` | Dirección C: esquinas discretas, bordes en vez de cajas. Práctica | 2026-11-04 |
| F12-DC23 | La marca tiene dos papeles con tokens distintos: `--marca-relleno` (fondo, siempre con texto blanco, igual en los dos temas) y `--marca` (texto e íconos, aclarada en oscuro) | Un relleno legible con blanco es oscuro y un texto legible sobre la superficie oscura es claro: ningún color cumple ambos. Práctica (WCAG 1.4.3) | 2026-11-04 |
| F12-DC24 | El logo se sube y se quita por route handler (`/admin/api/entidad/logo`), no por Server Action | El tope de 1 MB de las acciones no se toca (Fase 6); el handler rechaza un archivo grande por `Content-Length` con mensaje claro. Práctica | 2026-11-04 |
| F12-D25 | **El ejemplo del rechazo es el que calcula el algoritmo:** `#9ecbff` mide 1,69 con blanco y el mensaje dice «1,7:1»; la sugerencia es `#4a74a3` (4,86:1). El spec §7.1 se corrigió (R6, R13) | El plan decía 1,6 y el spec sugería `#2f6fbe`, que el algoritmo no produce: el manual y la demostración deben citar lo que el usuario verá. Práctica | 2026-11-04 |
| F12-D26 | En un mensaje de rechazo, si el redondeo a un decimal alcanza el mínimo (4,49 → «4,5») la razón se muestra con dos decimales truncados («4,49:1») (R10) | Un mensaje no puede decir «4,5:1; mínimo 4,5:1». Práctica | 2026-11-04 |
| F12-D27 | **Las sugerencias y los derivados conservan el tono:** los ajustes de luminosidad mapean al gamut bajando la croma por bisección con L y tono fijos (R11) | El recorte por canal cambiaba el tono de los colores saturados hasta 16° (`#fcd116` sugería un marrón); el spec pide "mismo tono". Costo: sugerencias algo menos saturadas. Práctica | 2026-11-04 |
| F12-D28 | `derivarMarca` vuelve a los colores por defecto si el primario o el secundario no son hex válidos, además de la validación de `obtenerMarca` y de la acción (R12) | Defensa en profundidad: esos valores terminan en el `style` de `<html>` y un valor manipulado en la BD podría inyectar CSS. Práctica (seguridad) | 2026-11-04 |
| F12-D29 | `--texto-terciario` pasa a `#677080` en claro y `#8b94a3` en oscuro (≥ 4,61:1 en todas sus superficies) (R16) | Los valores de la maqueta (§6.1) no llegaban a 4,5:1; AA prevalece sobre la maqueta. Práctica (WCAG 1.4.3) | 2026-11-04 |
| F12-D30 | `border-azul`, `outline-azul` y `ring-azul/…` pasan a `*-marca` (70 usos, test que lo exige); `bg-azul` queda como único uso del alias (R17) | Corrige §6.3: las utilidades ganan al anillo global de foco, y con el alias el foco en oscuro quedaba a 2,1:1. Práctica (WCAG 1.4.11) | 2026-11-04 |
| F12-D31 | La marca oscura (`--marca`, `--marca-2-texto`) se deriva contra `#1f242c`, la superficie oscura más clara donde se pinta texto de marca, y no contra `#161a20`; por defecto quedan `#5c90d5` (4,76:1) y `#36a14d` (4,72:1) (R18) | La barra lateral pinta texto de marca sobre `muted` y el tinte: contra `#161a20` quedaba en 4,18–4,38. Práctica (WCAG 1.4.3) | 2026-11-04 |
| F12-D32 | Tema oscuro no invertido: sombras con base negra, series de gráficas en grises neutros (no reutilizan colores de estado) e impresión siempre en claro (`color-scheme: light` en `@media print`) (R19) | Defectos que aparecían al invertir los tokens; spec maestro §5.11 prohíbe reutilizar los estados en series. Práctica | 2026-11-04 |
| F12-D33 | **Si la BD no responde, la página usa la marca por defecto:** el layout raíz envuelve `obtenerMarca` en `try/catch`, registra el error y usa `MARCA_DEFECTO` (R21) | Con la base caída, `/ingreso` y las páginas de error deben seguir pintándose. Costo: durante la caída se ve la marca genérica. Práctica (disponibilidad) | 2026-11-04 |
| F12-D34 | **El código nuevo usa los nombres de token** (`bg-marca-relleno`, `hover:bg-marca-oscurecida`, `text-marca`, `border-marca`…); los alias `azul`/`verde` quedan solo para el código heredado hasta la Fase 19 (R22). Regla en `AGENTS.md` | Que el renombrado de la Fase 19 no crezca con cada pantalla nueva. Práctica | 2026-11-04 |
| F12-D35 | **Excepción documentada a la regla 5 de trazabilidad:** cambiar el tema y marcar notificaciones como leídas no se audita (R24). Regla en `AGENTS.md` | Son preferencias de interfaz y lectura de avisos propios: no son evidencia de control documental y llenarían la bitácora. Costo: el cambio de tema no queda en la bitácora (auditarlo es una línea, `cambiar_tema`). Práctica; ISO 7.5 no lo pide (no es información documentada del SGC) | 2026-11-04 |
| F12-D36 | **`banda-solido`** (`color-mix(in srgb, var(--color-banda) 80%, black)`) para todo relleno de banda con texto blanco; tarjetas de búsqueda y de documento y el mini mapa pasan a `banda-tinte`/`banda-texto`/`banda-borde`; un test prohíbe cualquier otro `color-mix` con `--color-banda` (R26) | Mezclar el relleno con la superficie dejó «Descargar» a 2,76:1 sobre el verde institucional y rompió F9-D5; los tintes salían blancuzcos en oscuro. Práctica (WCAG 1.4.3) | 2026-11-04 |
| F12-D37 | **Defensas del logo:** la ruta guardada se confina a `marca/logo-<hex>.<ext>` (el `GET` público y el borrado no salen de ahí); sin `Content-Length` o no numérico, 411, y por encima de 1 MB más el sobre del formulario, 413, antes de leer el cuerpo; límite de 10 subidas por minuto; `Object.hasOwn` en la lista de MIME; `IHDR` obligatorio en PNG; nombre recortado a 255 caracteres antes de la auditoría inmutable; si el borrado del archivo anterior falla tras confirmar, no hay error 500 (R27) | Es una superficie pública y de escritura: una fila alterada no debe abrir todo el almacén, ni un cuerpo sin tamaño saltarse el tope. Práctica (seguridad, spec maestro §5.9) | 2026-11-04 |
| F12-D38 | **El aviso de datos personales es obligatorio** al guardar la entidad (mínimo 1 carácter; el lema sí puede quedar vacío); se aparta del spec §7.1 («0–5000») (R28) | Vaciar el aviso borraba en silencio el texto que cada titular acepta al ingresar. Regulación: Ley 1581 de 2012, art. 12; Decreto 1377 de 2013 | 2026-11-04 |
| F12-D39 | Pantalla de entidad: cada color se valida por su cuenta en vivo; hex con `required` y `pattern`; la validación en vivo sin `role="alert"` y las razones con `aria-live` 400 ms después del último cambio; la carga del logo limpia el campo tras un error, avisa el peso antes de enviar (1 MB + 1 byte = «1,1 MB») y ante un 401 pide volver a ingresar (R29) | Exactitud y accesibilidad de la pantalla del administrador: un lector de pantalla no debe recibir una ráfaga por tecla. Práctica (WCAG 4.1.3) | 2026-11-04 |
| F12-D40 | El encabezado de `TablaDatos` no se fija con una altura máxima del contenedor (R30) | Las listas son cortas y una altura fija estorba al imprimir. Costo: en una lista larga el encabezado no queda pegado. Práctica | 2026-11-04 |
| F12-D41 | **La banda OBSOLETO/ANULADO de la ficha del panel cumple AA:** se quita la opacidad del contenedor (5,72:1 obsoleto, 7,53:1 anulado) (R31) | Con `opacity-80` quedaba en ≈3,7:1, y la marca de obsoleto debe ser inequívoca. Práctica (WCAG 1.4.3) y regla de negocio 2 (ISO 7.5.3.2, control de versiones) | 2026-11-04 |
| F12-D42 | **Las filas inactivas no usan opacidad** (estructura, mapa, periféricos, tipos, procesos, subprocesos y usuarios): el estado se expresa con texto secundario, borde punteado y la etiqueta «Inactivo» (R32) | `opacity-60` bajaba «Borrar» a ≈2,9:1, y el estado no puede ir solo por color o intensidad. Práctica (WCAG 1.4.3 y 1.4.1) | 2026-11-04 |
| F12-D43 | **Un `notFound()` dentro de la app conserva el cascarón:** `src/app/(app)/not-found.tsx` («Página no encontrada»); la raíz queda para las URL sin ruta (R33) | Navegación consistente: la persona no pierde la barra lateral por un enlace roto. Práctica | 2026-11-04 |
| F12-D44 | Tokens `--formato-*` para el ícono de formato de archivo (identidad del formato, no estado; 6,81–8,19:1 en claro y 10,48–11,23:1 en oscuro, con test) y botones destructivos de confirmación en tinte con borde, iguales a `claseBoton("peligro")` (R34) | Se apartan del §6.1, que no listaba tokens de formato: sin ellos los íconos quedaban con colores fijos que el tema oscuro no cubre. Práctica (WCAG 1.4.3) | 2026-11-04 |
| F12-D45 | Las pantallas centradas (cuenta e ingreso) conservan su `h1` propio, sin `EncabezadoPagina` (R35) | No tienen migas ni acciones; el componente es para las páginas del cascarón. Práctica | 2026-11-04 |
| F12-D46 | Los títulos «… — Administración SGC» de las páginas del panel se quedan (R36) | F12-DC4 quita la barra "Administración SGC", no el `<title>`, que sigue distinguiendo la pestaña del panel. Práctica | 2026-11-04 |
| F12-D47 | **La campana y el menú de usuario se cierran como un desplegable** (`Desplegable`, sobre el mismo `<details>`): al cambiar la ruta, con Escape (el foco vuelve al `<summary>`; con el foco en otro diálogo, como `Ctrl K`, el Escape es de ese diálogo) y al pulsar fuera; abrir uno cierra el otro (grupo en JS y `name` común para la exclusión nativa). El tema se envía una vez, 400 ms después del último cambio de radio, o en cuanto el foco sale del formulario; Aplicar cancela el pendiente (I2, I3 de la revisión final) | El layout de `(app)` persiste: un `<details>` suelto seguía abierto tras navegar, y recorrer el tema con las flechas lanzaba una acción, un redirect y una revalidación por opción. Sin JavaScript los dos siguen funcionando. Práctica (patrón de menú desplegable accesible) | 2026-11-04 |
| F12-D48 | **La imagen no lleva el almacén ni los artefactos de trabajo** (`.dockerignore`: `almacen`, `respaldos`, `.superpowers`, `.playwright-mcp`, `coverage`) y crea `/app/almacen` vacío y del usuario `nextjs` (M8) | Los documentos y el logo de desarrollo no deben viajar dentro de una imagen. Sin la carpeta, `nextjs` no puede crearla en `/app` (de root): el compose de desarrollo, que no monta volumen, no podría subir archivos; un volumen nombrado nuevo hereda ese dueño. Práctica | 2026-11-04 |
| F12-D49 | **Los componentes cliente del cascarón se prueban sin DOM:** la lógica (cierre del desplegable, envío diferido) vive en módulos sin React ni DOM y se prueba con objetos simples y temporizadores falsos; el cableado de eventos se comprueba en la fuente y en el navegador | Sin dependencias nuevas sin proponerlas (Metodología, punto 2); no hay `jsdom` ni `happy-dom`. Costo: ningún test monta el componente con eventos reales. Si los componentes cliente crecen, proponer `happy-dom` o `jsdom` como dependencia de desarrollo. Práctica | 2026-11-04 |
| F12-D50 | **El nombre de la entidad se muestra completo en la barra lateral y en el cajón**, sin el recorte a dos líneas del spec §5.2: 14 px hasta 30 caracteres y 12 px si es más largo, con `break-words` (`claseNombreEntidad` en `ContenidoBarra.tsx`) | El usuario vio cortado «ESE Hospital Nuestra Señora de Fátima de Suaza». El nombre es la identidad de la entidad y un texto cortado sin forma de verlo completo es una barrera de accesibilidad. Práctica | 2026-11-05 |

## Decisiones adicionales (Fase 13A)

**Adición del 2026-11-06 (acta con formato y criterios):** F13A-AU1 a AU7 son las decisiones del
usuario, AC1 a AC6 las de Claude, AP1 a AP4 las previas a la ejecución y AR1 a AR6 las del
controlador (con otro prefijo para no chocar con R1 a R38). F13A-AU6 sustituye a F13A-DC12 y
resuelve F13A-R36. F13A-R35 sigue como decisión del usuario.

F13A-DC1 a F13A-DC28 vienen del spec de la fase (§23), del 2026-11-05. F13A-P1 a P5 son
resoluciones previas a la ejecución y F13A-R1 a R35 las resoluciones del controlador durante la
ejecución, del 2026-11-05 y el 2026-11-06: varias corrigen el plan y mandan sobre él. Son los
mismos números que citan los comentarios del código (`R24`, `R26`, `R32`, `R33`). Base: **ISO**
(cláusula de 9001:2015), **Regulación** o **Práctica**.

| # | Decisión y porqué | Base | Si es incorrecta |
|---|---|---|---|
| F13A-DC1 | En una eliminación, quien la pide no la aprueba (S3); si la pide un `admin_sgc`, aprueba Gerencia. Sin elaborador, el Coordinador SGC podría pedir, aprobar y ejecutar solo una baja | Práctica (separación de funciones) | Una regla en `validarDesignacion` y en los candidatos |
| F13A-DC2 | El visto bueno se omite si el proceso no tiene líder, y queda escrito en el historial, para no trabar el trámite | Práctica | Un documento sin visto bueno; se corrige asignando líder |
| F13A-DC3 | El solicitante puede retirar su solicitud antes de la aceptación | Práctica | Una acción de más en la tabla de transiciones |
| F13A-DC4 | Una creación duplicada se convierte en modificación dentro del mismo trámite, solo si el documento existente es del mismo proceso; si es de otro, se rechaza con la referencia | Práctica (procedimiento del hospital, PC-02) | Se retira la rama de conversión y se pide de nuevo |
| F13A-DC5 | El plazo de ajustes tras una devolución es el de revisión (5 días): ajustar es más corto que elaborar | Práctica | Un valor configurable |
| F13A-DC6 | Código, tipo, proceso propietario y título son datos de control: cambian solo por trámite (el título se aplica al publicar) y quedan fijos desde la aprobación; en una modificación no cambian código, tipo ni propietario. Descripción, palabras clave, otros procesos, relacionados y nivel de acceso son de catálogo, editables siempre | ISO 7.5.3.2 c) | Mover un dato de grupo toca el panel y la corrección |
| F13A-DC7 | El aprobador puede negar una eliminación: no hay nada que devolver a elaboración | Práctica | Una acción menos |
| F13A-DC8 | Los fallos de firma cuentan para el bloqueo, quedan en accesos como `firma_fallo` y cierran la sesión al bloquear: impide adivinar la clave desde una sesión ajena | Práctica (seguridad); spec maestro §5.1 | Un firmante distraído se bloquea y el Admin SGC lo levanta |
| F13A-DC9 | Un código de recuperación también sirve para firmar | Práctica | Quien perdió el teléfono pide quitar el factor |
| F13A-DC10 | El historial del trámite es de solo inserción, como `firmas` | ISO 7.5.3.1 b) | Un error se corrige con un evento nuevo |
| F13A-DC11 | Al publicar se vuelve a calcular la huella del archivo en disco. Es una comprobación única, no la verificación periódica rechazada | ISO 7.5.3.1 b) | Una lectura de archivo de más al publicar |
| F13A-DC12 | **Sustituida por F13A-AU6.** Se mantiene que el acta sale sin marca de agua y se genera si falta. Antes: el acta la ve quien ve la versión | ISO 7.5.3.1 a) | Una regla en la ruta del acta |
| F13A-DC13 | El panel deja de mostrar borradores a Control Interno y a la marca individual; el Maestro «todos» deja de listar documentos que solo tienen borrador | Práctica (spec maestro §5.3) | Se amplía `puedeVerVersion` |
| F13A-DC14 | La regla de restringido vale también para quien tiene la marca de historial: da historial, no acceso a lo restringido | ISO 7.5.3.1 b) | Quien tenga la marca necesita sus procesos asignados |
| F13A-DC15 | Control Interno y la marca individual ven en solo lectura los trámites cerrados por publicación o eliminación | ISO 7.5.3.2 c) | Una condición en `puedeVerTramite` |
| F13A-DC16 | Estado `descartado` y unicidad parcial del número de versión: versiones publicadas consecutivas, con lo cancelado conservado | ISO 7.5.3.2 c) | Otra migración |
| F13A-DC17 | Descartar un borrador de carga: hoy uno creado por error no tiene salida y bloquearía un trámite | Práctica | Un botón de más |
| F13A-DC18 | El camino directo solo da de alta; la anulación directa desaparece; con la carga abierta se puede deshacer una carga, conservando el código | Práctica (spec maestro DC26 y adición 7) | Corregir un dato cargado exigiría un trámite |
| F13A-DC19 | La entrada **Trámites** se ve por permiso o por participación: un elaborador con rol consulta debe llegar a su trámite | Práctica | Un enlace de más o de menos |
| F13A-DC20 | `archivos` no se generaliza hasta la 13B: en la 13A todo archivo pertenece a una versión | Práctica | La 13B decide la forma |
| F13A-DC21 | La demo adopta la convención del hospital y la base de desarrollo se vuelve a sembrar | Práctica | Se pierde lo probado a mano en esa base |
| F13A-DC22 | Formato, Registro y Matriz nacen diligenciables | Práctica | Un dato editable |
| F13A-DC23 | Los tests del flujo corren en transacciones que se revierten: no acumulan trámites y firmas imborrables | Práctica | Parámetros `sql` de más |
| F13A-DC24 | `tramites.participar` para los cinco roles y un permiso de matriz en cada acción: el elaborador puede ser cualquier funcionario | Práctica (`AGENTS.md`, regla 4) | Una fila de la matriz |
| F13A-DC25 | Los borradores intermedios no se conservan; de cada ronda quedan la huella firmada, la lista y las observaciones | Práctica | Conservarlos exige cambiar el índice de un principal por versión |
| F13A-DC26 | Los archivos de un trámite solo se sirven por su ruta mientras está abierto; después rige el estado de la versión | Práctica (`AGENTS.md`, regla 3) | Se amplía `archivoDeTramite` |
| F13A-DC27 | El aviso de escalamiento al jefe va sin título ni enlace, y el jefe no gana acceso al trámite | ISO 7.5.3.1 b) | El jefe le pregunta a su subalterno |
| F13A-DC28 | «Procesos que lidera» pasa a «Procesos» y vale para cualquier rol: es el mecanismo de los documentos restringidos | Práctica (spec maestro §5.3) | Cambia el sentido de un campo |
| F13A-P1 | Todo lo que una transición escribe con fecha usa `opciones.ahora`; `registrarFirma` recibe `ahora?` y lo guarda. Las fechas de un mismo acto no pueden diferir | Práctica | Un parámetro opcional de más |
| F13A-P2 | «La conexión como última opción» vale para las consultas que corren solas. Las que solo tienen sentido dentro de una transacción reciben `tx` primero, y el camino directo y la configuración conservan su estilo heredado | Práctica | Esos tests dejan datos `ZZ-*` si fallan a mitad |
| F13A-P3 | Se trabaja en la rama, en el mismo directorio y sin worktree: la BD, `.env.local`, `almacen/` y el compose viven aquí | Práctica | Ninguno: `main` queda intacto hasta el cierre |
| F13A-P4 | Los puntos de control en navegador los hace el controlador, no el implementador de la tarea | Práctica | Ninguno |
| F13A-P5 | El punto de control 3 lo hace un agente verificador, y el controlador revisa su informe y una muestra de capturas | Práctica | Una falsa confianza, que acotan la muestra y la prueba del usuario |
| F13A-R1 | `patronDesdeFormato` escapa lo literal y un `patron_codigo` heredado que no compila cae al valor por defecto sin lanzar (`patronDeConfiguracion`, función pura) | Práctica | Unas líneas de más |
| F13A-R2 | `obtenerDetalleSubproceso` no recibe sujeto: no trae conteos y el parámetro quedaría muerto. Se aparta del encargo | Práctica | Una firma por ampliar |
| F13A-R3 | El GET de archivos del panel responde 404, no 403, a quien no puede ver ese archivo. Cambia `AGENTS.md` («403 sin permiso») con esta excepción | Práctica (spec 13A §12) | Un código de estado |
| F13A-R4 | `transicionar` comprueba sin bloquear, verifica la firma fuera de la transacción y repite lo mismo dentro con `FOR UPDATE`; las acciones que firman tienen un validador de solo lectura. El plan verificaba con la fila bloqueada: cinco firmas simultáneas colgarían el pool, y un código de recuperación se gastaría aunque faltara un dato | Práctica | Una segunda lectura por firma, y un código de recuperación se gasta si otra pestaña se adelanta |
| F13A-R5 | Retirar avisa a los líderes de todos los procesos del documento, el detalle del efecto no pisa `de`, `hacia` ni `ronda`, y hay una sola `ETAPAS_ABIERTAS` | Práctica (spec 13A §14.2) | Unas líneas de más |
| F13A-R6 | `tramite.resuelto` gana sobre `tramite.paso` para un mismo destinatario: un solo aviso por persona | Práctica | Un aviso menos claro para un Admin SGC único que pidió la solicitud |
| F13A-R7 | Al aceptar una creación se puede corregir tipo, proceso y título. Si cambia el propietario, el visto bueno anterior queda en el historial y el cambio en el evento; no se vuelve a pedir | Práctica (procedimiento, paso 3) | Un documento entra a un proceso cuyo líder no dio visto bueno |
| F13A-R8 | Parecidos por título o palabras clave. Ante un choque de código, si no se editó a mano se toma el siguiente; si se editó, el error nombra el disponible. Mandan §8.3 y §8.4 sobre el encargo | Práctica | Un código final distinto del que se vio en el formulario |
| F13A-R9 | En `DialogoFirma` la clave y el código no se conservan tras un rechazo; los demás campos, como el concepto, sí | Práctica | Reescribir la clave tras cada fallo, que es lo esperado |
| F13A-R10 | Las dos rutas de subida salen del `matcher` y `recibirArchivo` compara `content-length`: el proxy truncaba lo que pasaba de 10 MB y respondía 201 | ISO 7.5.3.2 | El `matcher` queda algo más difícil de leer |
| F13A-R11 | Mientras una versión pertenezca a un trámite abierto, sus archivos y su control de cambios solo se tocan desde el trámite (`FOR SHARE`), lo que cierra la carrera entre subir y enviar | Práctica (spec 13A §9.1) | Un Admin SGC no corrige un archivo desde el panel: lo hace quien elabora o se reasigna |
| F13A-R12 | `DialogoFirma` sin `inputMode numeric`, porque los códigos de recuperación llevan letras, y **Enviar a revisión** desactivado con el control de cambios sin guardar. Se aparta del encargo en lo primero | Práctica | Un teclado menos cómodo |
| F13A-R13 | Menores de la subida y la firma: `valoresDeFormulario` no devuelve la clave, 409 antes de recibir el archivo, zona de carga oculta en una versión en trámite, y el candado revisa que quien escribe siga siendo el elaborador | Práctica | Unas líneas de más |
| F13A-R14 | `valoresDeFormulario` excluye la clave siempre y `codigo` solo si viaja con clave: el formulario de documentos usa un campo `codigo` que debe volver tras un rechazo. Se aparta de R13 | Práctica | Un código TOTP enviado sin clave volvería al navegador, cosa que ninguna acción hace |
| F13A-R15 | La página pide la lista y las observaciones aparte de `obtenerTramite`: solo pagan esas consultas quienes las pintan. Se aparta del encargo | Práctica | Una consulta más |
| F13A-R16 | La eliminación solo anula la versión aprobada, los avisos van en una sola inserción, el título anterior queda en el registro y S1 se comprueba también al firmar | Práctica | Unas líneas de más |
| F13A-R17 | El acta se congela en el cierre: los datos salen a `detalle.acta` del evento y solo las firmas se leen aparte. Se escribe por archivo temporal y `rename`; una fila sin archivo se regenera solo si la huella coincide | Regulación (Ley 527 de 1999, registro inalterable) y spec 13A §11.2 | Un detalle más grande en el evento |
| F13A-R18 | Reasignar y corregir admiten `aprobadorId` junto al cambio y validan el conjunto completo: cancelar perdería el trabajo y gastaría el código | Práctica | Un campo opcional más |
| F13A-R19 | La corrección admite el proceso propietario en una creación. **Se apartó del encargo, que lo omitía: manda el spec §8.6** | Práctica | Unas líneas y un campo |
| F13A-R20 | S1 y S2 miran las firmas `elaboro` de todas las rondas al reasignar | Práctica (spec 13A §6.3) | Una consulta y un rechazo de más |
| F13A-R21 | Las marcas de aviso se conservan si no cambia el paso, la fecha ni su responsable. **Se apartó del ajuste de la Tarea 12: manda el spec §14.3** | Práctica | Un aviso menos tras una reasignación |
| F13A-R22 | Se aceptan: un cambio de solo fecha no avisa, quien sale conserva el enlace, y `revisarVencimientos` no deja fila en `auditoria` porque no es acción de una persona. El punto «corregir el tipo no exige la sigla» lo reemplazó R32 | Práctica | Mejoras pequeñas posteriores |
| F13A-R23 | Se aceptan: sin candado asesor para dos correcciones simultáneas del mismo código y sin aviso a los líderes del proceso nuevo al corregir | Práctica | Un código abandonado repetido en un caso rarísimo, y un aviso menos |
| F13A-R24 | `descartarBorrador` funciona con la carga cerrada: un borrador pendiente bloquearía la aceptación. **Se apartó del encargo: manda el spec §13.3** | Práctica | Un botón de más con la carga cerrada |
| F13A-R25 | La columna de fecha del Maestro pasa a «Fecha de aprobación» para no repetir «Aprobación». Se aceptan también la cifra propia del encabezado del panel, `sin-reiniciar.ts` y mover ayudantes a `codigos.ts` | Práctica | Una etiqueta |
| F13A-R26 | Deshacer una carga se bloquea con una versión anulada: el dato no distingue ese caso de un documento eliminado, y un trámite de modificación sigue siendo salida | Práctica | Esa corrección va por trámite |
| F13A-R27 | La relación entre documentos es simétrica: el portal la lee en las dos direcciones desde la herencia | Práctica | Habría que distinguir «relacionado con» de «relacionado por» |
| F13A-R28 | La autoridad se valida al firmar **Aprobar** con la del tipo actual; el Coordinador reasigna; publicar no la vuelve a exigir. **Se apartó de lo construido en la Tarea 14: manda el spec §6.3** («al designar, al reasignar y al firmar») | ISO 7.5.2 c) y PC-07 | Tras cambiar la autoridad, el aprobador de un trámite abierto debe reasignarse |
| F13A-R29 | El consecutivo cuenta dígitos de cualquier ancho; reordenar marcadores se admite con advertencia en la ayuda | Práctica (spec 13A §8.4) | Tras reordenar, el Coordinador corrige el sugerido |
| F13A-R30 | `Boton` y `BotonesOrden` dejan `opacity`; los demás botones heredados quedan como deuda: no se refactoriza sin avisar | Práctica (`AGENTS.md`) | Unos botones con otro aspecto |
| F13A-R31 | `npm test` no depende del uso de la demo: `tramiteEn` crea su documento y `semilla-tramites.test.ts` filtra lo sembrado y salta lo actual con mensaje | Práctica | Unos casos saltados tras usar la demo |
| F13A-R32 | El código de un trámite debe coincidir con las siglas del propietario y del tipo; se comprueba si cambian código, tipo o propietario. No aplica a la carga directa ni a las modificaciones | ISO 7.5.2 a); spec 13A §8.4 | Un código especial exige ajustar el formato |
| F13A-R33 | El acta translitera símbolos comunes y avisa al final si quedó algún «?», sin fuentes ni dependencias nuevas | Regulación (Ley 527 de 1999, integridad del mensaje) | Un símbolo se ve distinto en el acta; el texto íntegro sigue en el historial |
| F13A-R34 | De los 17 menores del punto de control 3 no se hace M12 (aviso al recargar); lo demás entra en la ola, con los nombres cortados de la barra y el rol solo del paso pendiente | Práctica | Más líneas que revisar |
| F13A-R35 | Se acepta el 200 con «Página no encontrada» en páginas de `(app)`: un 404 real exige reorganizar rutas o usar el proxy. No hay fuga, y los archivos sí dan 404. **Pendiente de la decisión del usuario** | Práctica (spec 13A §6.5) | Un código HTTP en páginas, no en archivos |
| F13A-R36 | **Resuelta por F13A-AU6:** el usuario decidió abrir el acta a quien ve el trámite cerrado. Antes: se mantenía F13A-DC12 (el acta sigue a la versión) y se le preguntaba antes de fusionar | ISO 7.5.3.1 a) | Si es incorrecto: un `if` en dos sitios |
| F13A-R37 | Lista de verificación: migración 0005 con los ocho ítems si la tabla está vacía, más al menos un ítem activo para dar el concepto. Sin ellos, el PC-05 queda sin evidencia | ISO 9001 7.5.2 c) | Si es incorrecto: el Coordinador ajusta la lista y un concepto se bloquea hasta que active un ítem |
| F13A-R38 | Los Declined 1 a 6 y 8 a 12 de la revisión final se aceptan como están (GET del panel heredado; cancelar en publicación; corregir en revisión; R7; R22; R35; revisor reemplazado que elabora; lista durante revisión; limpieza de tests; TOTP sigue como decisión del usuario). De los Minor entran 1, 3, 4, 5, 6, 7 y 9, con el Minor 3 omitiendo los códigos de parecidos en el acta; los Minor 2 y 8 y la reimplementación de `demo.ts` pasan a deuda | Práctica: son pequeños o exigen diseño | Si es incorrecto: deuda registrada en `CONTEXT.md` |
| F13A-AU1 | Usuario: el formato se usa como **membrete PDF** de un documento controlado del SGC; el sistema imprime el acta en su espacio libre | ISO 7.5.2 y 7.5.3.1; el hospital ya tiene su formato | Los espacios del encabezado y del pie se miden a mano y se comprueban con **Ver acta de ejemplo** |
| F13A-AU2 | Usuario: no se llena el SGC-FO-015; se crea un formato propio con el mismo encabezado y pie, otro título y otro código | Práctica: el 015 es de actas de reunión | Alguien debe preparar el formato en Word y guardarlo como PDF |
| F13A-AU3 | Usuario: un solo formato, con título neutro, para el acta de aprobación y la de eliminación | Práctica: un solo documento que mantener | El título del formato no distingue las dos actas; lo dice el título que imprime el SGC |
| F13A-AU4 | Usuario: un criterio no crítico en «No cumple» no bloquea, pero se advierte, exige nota y deja constancia; el crítico bloquea sin excepción | ISO 9001 7.5.2 c) y 7.5.3.2 c); PC-05 y PC-07 | Más fricción al revisar; un concepto con criterios necesita notas |
| F13A-AU5 | Usuario: el aprobador también confirma expresamente | ISO 7.5.2 c): la aprobación es una decisión informada | Un diálogo más largo para quien aprueba |
| F13A-AU6 | Usuario: el acta se abre a quien ve el trámite cerrado. **Sustituye F13A-DC12 y resuelve F13A-R36** | ISO 7.5.3.1 a): quien participó no debe perder su registro | El acta no lleva el contenido del documento; ver el acta no abre el archivo |
| F13A-AU7 | Usuario: el acta imprime cada criterio con su nota, y el campo advierte que será visible para toda la entidad | ISO 7.5.3.1 a) y Regulación (Ley 527 de 1999, integridad) | Quien escribe la nota debe saber que la leerá toda la entidad |
| F13A-AC1 | Claude: los archivos reales del hospital (Word y PDF) se excluyen de git con `.git/info/exclude`, no con `.gitignore` | Práctica: llevan nombres, firmas y NIT de la entidad | Cada copia de trabajo necesita su exclusión |
| F13A-AC2 | Claude: si al cerrar el trámite el documento del formato no tiene versión vigente o ya no es general, se congela `formato: null` y el acta sale con el diseño básico; `editarCatalogo` no se bloquea | Práctica: así el acta sigue siendo determinista | Un acta puede salir con el diseño básico aunque haya un formato elegido |
| F13A-AC3 | Claude: la pantalla de configuración revisa el formato al cargarse, con su archivo y su huella, y avisa «Las actas saldrán con el diseño básico» o «No se podrán generar actas hasta restaurar el archivo del formato» | Práctica: una versión nueva del formato puede dejar de servir sin que nadie lo note | Una lectura de archivo cada vez que se abre la pantalla |
| F13A-AC4 | Claude: un ítem cuenta como crítico si lo marca la fila guardada **o** el ítem actual; retira de la deuda «un ítem vuelto crítico después no bloquea» | ISO 7.5.2 c) | Un ítem vuelto crítico a mitad de ronda bloquea aunque se haya guardado sin esa marca |
| F13A-AC5 | Claude: quien solo firmó «Publicó» no cuenta como participante del trámite | Práctica: incluirlo abriría también la página del trámite | Quien publica sin ser Administrador del SGC no ve el acta |
| F13A-AC6 | Claude: la confirmación lleva una huella de los criterios mostrados, y el servidor rechaza una vieja con «La lista cambió mientras tenía abierto el diálogo. Recargue la página.» | ISO 7.5.2 c): nadie acepta un criterio que no vio | Con dos pestañas hay que recargar y firmar de nuevo |
| F13A-AP1 | `criteriosNoCumplen` filtra por la marca guardada en la fila (`NOT r.critico`), no por la actual: un ítem vuelto crítico después del concepto sigue visible para quien aprueba | Práctica: el spec limita la marca actual a `validarConcepto` | El aprobador vería un criterio que hoy es crítico, con su nota |
| F13A-AP2 | El aprobador usa la misma confirmación con huella que el revisor: un solo esquema y una sola comprobación; manda sobre el spec, que decía que no la necesitaba | Práctica (ya se le dijo al usuario; F13A-AU5) | Un campo con más texto en el diálogo del aprobador |
| F13A-AP3 | `tests/utiles/demo.ts` y los tests que dependían del consecutivo de formatos en SGC se actualizan, sin debilitarlos, por sembrar `SGC-FO-06` | Práctica | Unas líneas de test |
| F13A-AP4 | La adición va en la misma rama, sin worktree | Práctica: va antes de fusionar y el usuario la pidió ahí | Ninguno: `main` sigue intacto |
| F13A-AR1 | La huella cubre también el texto del criterio | Spec §5.2 («criterios mostrados») manda sobre el plan | Una línea y dos tests |
| F13A-AR2 | Un ítem vuelto crítico se pinta como crítico y bloquea en pantalla, con `criticosActuales` aparte para no tocar la forma de `detalle.lista` | Práctica: el revisor no veía cuál bloqueaba | Una prop de más |
| F13A-AR3 | El commit `ad130c8` (solo tests, en rojo por sí solo) se deja como está, sin reescribir la historia | Práctica: el arreglo está en el commit siguiente | Un commit rojo en la historia: afecta solo a `git bisect` |
| F13A-AR4 | Un formato con `/Contents` vacío da «listo», sin aviso propio | Práctica: para eso existe **Ver acta de ejemplo**, y no lanza | Un acta sin encabezado hasta que alguien lo note |
| F13A-AR5 | Se acepta una fila `acta_no_regenerable` por reintento, sin limitador | ISO 7.5.3.1 a) y regla 5: deja constancia de a quién se le negó el acta | Unas filas de más en un caso raro |
| F13A-AR6 | El formato se lee en `asegurarActa` y no en `reunirDatosActa` | Práctica: evita leerlo con el acta ya en disco | Ninguno: es dónde vive la lectura |
| F13A-AR7 | El manual (§14.3) y el paso 14 de «Qué probar» dicen que el formato debe quedar con versión vigente publicada (carga abierta o trámite), y que el elegido sigue en la lista aunque ya no sirva. Es el R7 de la revisión de T8 de estas adiciones (no la decisión F13A-R7 de la 13A) | Práctica: sin versión vigente el formato no aparece y la persona no sabe por qué | Una frase más en dos documentos |
| F13A-AR8 | `huellaDeCriterios` ordena por `itemId`, y el último criterio del acta reserva el sitio de «Concepto de» para que no quede sola en otra hoja. La reserva reduce el caso, pero no lo elimina del todo (ver la deuda) | Práctica: reordenar ítems no cambia lo confirmado; la fila separada de sus criterios se vio con el formato real | La hoja puede dejar un hueco de una o dos líneas al pie antes de pasar de página |

## Decisiones adicionales (Fase 13B)

F13B-DC1 a F13B-DC27 vienen del spec de la fase (§22), del 2026-11-07; DC24 a DC27 salieron de la
revisión del constructor, antes de la aprobación. F13B-R1 a R17 son las resoluciones del controlador durante la
ejecución y R18 a R22, las de la ola final tras la revisión de toda la rama (mandan sobre el plan). Base: **ISO**
(cláusula de 9001:2015), **Regulación** o **Práctica**.

| # | Decisión y porqué | Base | Si es incorrecta |
|---|---|---|---|
| F13B-DC1 | Sello en franja al pie de cada página (no cuño en la esquina) y una sola entrada «Distribución» con cuatro pestañas: eran las recomendadas y el usuario no hizo clic. La franja no tapa el encabezado; la barra ya tenía trece entradas | Práctica | Cambiar la geometría del sello y repartir la entrada en la barra |
| F13B-DC2 | Una copia de un documento restringido solo se emite a un punto cuyo responsable puede verlo: la copia daría acceso a quien no lo tiene | ISO 7.5.3.1 b) | Quitar la comprobación en `emitirCopia` |
| F13B-DC3 | `url_publica` en Entidad y marca; sin ella el sello sale sin QR. La cabecera `Host` la controla el cliente y cambia en la Fase 20: el papel debe sobrevivir | Práctica (seguridad) | Tomar la dirección de la petición |
| F13B-DC4 | El QR lleva la versión (`?v=`) y la ficha avisa si no es la vigente: convierte el QR en verificación de vigencia frente al papel | ISO 7.5.3.2 c) | QR sin `v`; la ficha deja de comparar |
| F13B-DC5 | Medidas del sello configurables, con valores por defecto (franja 1,0 cm, QR 1,5 cm): el pie de los formatos del hospital puede acercarse al borde | Práctica | Valores fijos |
| F13B-DC6 | `copia_eventos` y `acuse_eventos` de solo inserción; `acuses` guarda el estado actual con unicidad parcial; la verificación cerrada es inmutable: son la evidencia de PC-09 y PC-10, y una fila inmutable no admite la reversión ni el regreso a la audiencia | ISO 7.5.3.1 b) | Una tabla de estado mutable y sin historial |
| F13B-DC7 | Una copia recogida con destino «no se encontró» abre un hallazgo: es la «pérdida de registros» que el procedimiento trata como no conformidad | PC-12 del procedimiento | Cerrar la copia sin hallazgo |
| F13B-DC8 | Una sola función (`alDejarDeSerVigente`) marca las copias por recoger en los tres lugares donde una versión deja de ser vigente (`aplicarPublicacion`, `anularVigenteEn`, `deshacerCarga`): una regla, tres llamadas; el tercero es fácil de olvidar | Reglas de negocio 1 y 2 | Lógica repetida en tres sitios |
| F13B-DC9 | Los firmantes (elaboró, revisó, aprobó) y quien publicó nacen acusados por firma solo si están en la audiencia: manejaron el documento, y un aprobador sin procesos no recibe fila | Práctica | Acuse para todos los firmantes, estén o no en la audiencia |
| F13B-DC10 | Los acuses pendientes pasan a `superado` cuando la versión deja de estar vigente y a `retirado` cuando la persona se desactiva o pierde la visibilidad; ninguno cuenta en el porcentaje: lo que hay que leer es la vigente y un inactivo no debe hundir el porcentaje | Práctica | Contarlos como pendientes |
| F13B-DC11 | «Lectura obligatoria al ingresar» apagada por defecto: encendida en todo, cada persona nueva recibiría decenas de tareas | Práctica | Encendida por defecto |
| F13B-DC12 | La tarea de acuse de una versión sin control de cambios muestra «Versión N, vigente desde…»: las versiones cargadas o heredadas no lo tienen | Práctica | Texto vacío |
| F13B-DC13 | La evidencia de la jornada es recomendada, no obligatoria; la pantalla marca «Sin acta adjunta»: el registro con asistentes ya es evidencia y exigir el archivo haría que no se registre | ISO 7.2 d) | Obligar el archivo |
| F13B-DC14 | Anular una jornada revierte los acuses que concedió: un acuse no puede apoyarse en una jornada anulada | ISO 7.5.3.1 b) | Dejar los acuses confirmados |
| F13B-DC15 | Sin entidad «ronda»: el porcentaje actual sale de la última verificación de cada punto activo; el histórico se filtra por fechas. Más simple y siempre al día | Práctica | Una tabla de rondas |
| F13B-DC16 | El Admin SGC único puede verificar su propio punto, con marca visible («la verificó quien responde por el punto»): no trabar una instalación con un solo Admin SGC | Práctica (spec maestro DC9) | Que verifique Control Interno (sin migración) |
| F13B-DC17 | Un punto con copias vivas no se desactiva; un usuario responsable de puntos activos no se desactiva hasta reasignarlos: una tarea de recogida sin dueño rompe la cadena del PC-08 | Práctica | Permitirlo y dejar tareas huérfanas |
| F13B-DC18 | Crear un punto desde un subproceso del mapa, como atajo sin vínculo permanente: los servicios ya están escritos en el mapa | Práctica | Quitar el atajo |
| F13B-DC19 | «Distribución» visible también al responsable de un punto, limitada a sus puntos (`siResponsable`): un responsable con rol consulta debe llegar a sus copias | Práctica (F13A-DC19) | Solo por permiso |
| F13B-DC20 | `archivos` con `contexto` y `contexto_id`, `version_id` opcional y `CHECK`; filas heredadas intactas: una sola tabla y un solo flujo de subida | Spec maestro §5.5 | Una tabla por dueño |
| F13B-DC21 | Revisión de vencimientos por versión para los acuses y un aviso por jefe: una publicación a 40 personas no debe ser 40 transacciones ni 40 avisos al mismo jefe | Práctica | Fila a fila |
| F13B-DC22 | «Mis tareas» agrupa por tipo cuando hay muchas (más de cinco lecturas): una publicación masiva no entierra las demás tareas | Práctica | Lista plana |
| F13B-DC23 | La verificación abierta se puede descartar con motivo, sin cerrarla: una abierta por punto no debe trabar la siguiente | Práctica | Obligar a cerrarla |
| F13B-DC24 | Ventana de impresión de 15 minutos tras emitir o reimprimir, con un solo evento `impresa` por ventana; las descargas de quien solo ve quedan como `consultada`: la emisión redirige a un `GET` que el navegador repite, y «reimprimir exige motivo» debe cumplirse en el servidor | Práctica | Un evento por descarga |
| F13B-DC25 | Los hallazgos y la recogida en verificación ocurren al cerrar; la foto se adjunta al ítem: un ítem corregido antes de cerrar no deja hallazgos huérfanos y la evidencia se escribe una vez | ISO 7.5.3.1 b) | Hallazgo por ítem al responderlo |
| F13B-DC26 | Un acuse pendiente se retira al salir de la audiencia, evaluado por diferencia al editar la persona, la lista o el documento: la audiencia es quién debe conocer el documento hoy | ISO 7.5.3.2 a) | Dejarlo pendiente |
| F13B-DC27 | El responsable nuevo de un punto con copias vivas de un restringido debe poder verlo; anular una copia lo hace quien la emitió o quien gestiona: misma regla de la emisión, permiso de matriz más condición de persona | ISO 7.5.3.1 b) | Anulación solo por quien gestiona |
| F13B-R1 | Se trabajó en la rama de la fase en el directorio principal, sin worktree: `.env.local`, `./almacen` y la BD de desarrollo (5435) están atados a esta carpeta, como en la 13A | Práctica | Solo convención |
| F13B-R2 | `crearAcusesAlPublicar(tx, versionId, ahora, firmantes)` recibe los ids de los firmantes desde el manejador (`elaboro`, `reviso`, `aprobo` más quien publica = `sesion.usuarioId`): dentro del manejador la firma `publico` todavía no está en `firmas` | Práctica | Un parámetro de más |
| F13B-R3 | Un punto de uso puede tener cero procesos: el campo solo sirve al alcance del líder y a la sugerencia, y Archivo no tiene proceso propio (el spec decía «uno o varios») | Práctica | Una validación de una línea |
| F13B-R4 | Los defectos del sello se quedan en 1,0 y 1,5 cm (sirven a otras entidades). El hospital fija 0,6 cm en Configuración documental y la franja pinta dos líneas mientras mida 0,6 cm o más (`(alto − 2 pt) / 2,5 ≥ 6 pt`) y una sola por debajo; el QR no depende de la franja | Práctica | Cambiar el valor por defecto |
| F13B-R5 | Reimprimir y obtener el PDF de una copia que la persona no ve responde 404, no 409 (regla global del 404); la ventana vencida, la versión no vigente y la huella distinta tienen mensaje propio | Spec 13A §12 | Dos líneas de ruta |
| F13B-R6 | El periodo de los acuses se calcula con `COALESCE(publicado_en, primer acuse)`: las versiones cargadas fuera de la plataforma (toda la carga inicial) no tienen `publicado_en` y la pantalla quedaba vacía | Práctica | Una expresión SQL |
| F13B-R7 | Quitar una lista del documento retira los acuses de quienes solo pertenecían por esa lista (spec §9.3); los componentes no consultan la BD | ISO 7.5.3.2 a) | Dos cambios pequeños |
| F13B-R8 | Las jornadas admiten versiones vigentes y obsoletas (registrar tarde la capacitación sobre la versión anterior), con selector de versión; en jornadas de varios documentos no se filtra el código ni el título de un restringido que quien mira no ve | ISO 7.5.3.2 | Quitar el selector |
| F13B-R9 | Quien registró una jornada puede adjuntar o quitar evidencia durante 24 horas; después queda inmutable. Anularla la hace quien la registró o `distribucion.gestionar` | ISO 7.5.3.1 b) | Ajustar `VENTANA_EVIDENCIA_MS` |
| F13B-R10 | El permiso `distribucion.gestionar` es solo de `admin_sgc`: no existe «líder con gestionar fuera de su alcance» | Práctica | — |
| F13B-R11 | Activar y desactivar un punto o una lista llevan frase y nombre de filtro propios en la bitácora (se escriben con nombre armado por plantilla); `exporto_socializaciones` queda fuera porque no hay ruta de Excel | Práctica | Sumar la ruta y la frase |
| F13B-R12 | «Mis tareas (N)» muestra el total real de tareas (el mismo número de la barra lateral) y no el de filas agrupadas | Práctica | Dos números distintos |
| F13B-R13 | La compuerta de copias de la página del trámite (`distribucion.ver` o `copias.emitir`) es la misma de `BloqueDistribucion`; los conteos de acuses se muestran a quien ve el trámite sin compuerta: son cifras agregadas, no personas | Práctica | Un participante ve «acuses 3 de 10» de una versión que no le toca |
| F13B-R14 | Los avisos de vencimiento no se recorren en navegador: los plazos tienen piso de 1 día y toda la demo es de hoy; la cobertura queda en `tests/distribucion-vencimientos.test.ts`. La demo trae, además, vencidos sembrados con fechas relativas | Práctica | Un aviso mal pintado en la campana |
| F13B-R15 | La semilla se parte en dos llamadas (`sembrarDistribucionPrevia` antes y `sembrarDistribucion` después de los trámites): `emitirCopia` solo emite la vigente y la v3 de `GTH-CA-01` ya está publicada al terminar los trámites. No se llama `pedirAcuses`: la publicación de la v3 crea los acuses de «Todo el hospital» con origen `publicacion`; la jornada es de hace 5 días (relativa), no del 14 de octubre | Práctica | La demo cuenta la historia con otro origen, sin efecto funcional |
| F13B-R16 | Los tests que dependen de filas de la BD de desarrollo se reescriben para no depender de datos preexistentes (conteo de archivos con `contexto <> 'version'`, fotos de ítems, notificaciones de un usuario), porque las acumulan los puntos de control manuales | Regla de tests contra la BD de desarrollo | — |
| F13B-R17 | Abrir una verificación es un POST con pantalla de confirmación («Verificar <punto>»), auditado como `verificacion_abierta`: un `GET` no debe crear filas ni dejar verificaciones abiertas por una precarga | Práctica | Abrir con un enlace `GET` |
| F13B-R18 | El líder emite y reemplaza copias de los documentos de su alcance hacia **cualquier punto de uso activo**: la restricción es el documento (`documentoEnAlcance`), no el punto. El diálogo pone primero los puntos de los procesos del documento y luego los demás activos, para todos los roles; «Reemplazar (k)» cuenta los puntos donde emite; las copias nuevas aparecen en «De la versión vigente» (el aviso con el conteo no llega a verse: la ficha se vuelve a pintar y desmonta el formulario; está en la deuda) | Spec §8.1; la restricción por proceso dejaba sin reemplazar copias que el Admin repartió en otros servicios | Un líder ve los nombres de todos los puntos activos en el diálogo |
| F13B-R19 | Fuera de la ventana de impresión, quien emite ve **Reimprimir** y no **Abrir el PDF**; el PDF fuera de la ventana o ya no disponible, y los errores de la reimpresión, vuelven a la página de la copia con su aviso en texto (`?ventana=1`, `?aviso=<clave>`) en vez de un 409 en JSON en otra pestaña. Ajusta F13B-R5 y la línea 1 del Review Focus del plan; el 404 de quien no ve la copia no cambia | Práctica | Un JSON en una pestaña nueva |
| F13B-R20 | El responsable de un punto sin `distribucion.ver` (rol Consulta) no ve la pestaña ni la página de **Acuses de lectura**, y `resumenAcuses` le devuelve vacío; sigue viendo Copias y Verificaciones de sus puntos. Precisa F13B-DC19 | Spec §6.4 | El responsable ve los porcentajes de toda la entidad |
| F13B-R21 | Al cerrar una verificación rige la regla de la apertura con quien cierra: si es el responsable actual del punto y hay otro Admin SGC activo, se rechaza; si no lo hay, cierra y `propio_punto` queda marcado en el mismo `UPDATE`. Extiende F13B-DC16 al cierre (el responsable puede cambiar con la verificación abierta) | Práctica (spec maestro DC9) | La marca solo dice quién abrió |
| F13B-R22 | «Nadie se avisa a sí mismo» (spec §12.2) quita el aviso, no la tarea: quien publica y responde por un punto no recibe «Recoja…» pero tiene la tarea; quien pide acuses y está en la audiencia recibe su acuse sin aviso; quien elimina no recibe «dejó de aplicar» | Práctica | Avisos de más a quien hizo el cambio |

## Decisiones adicionales (Fase 13C)

F13C-DC1 a F13C-DC39 vienen del spec de la fase (§23), del 2026-11-08; DC31 a DC39 salieron de la revisión del constructor,
antes de la aprobación. Las decisiones del usuario están en el §2 del spec. F13C-R1 a R41 son las resoluciones del
controlador durante la ejecución (2026-11-08 y 2026-11-09) que cambiaron lo que el usuario ve o lo que el spec decía; entre
paréntesis, el número de «Ruling» de la bitácora de ejecución, el que citan algunos comentarios del código. Mandan sobre el
plan. Base: **ISO** (cláusula de 9001:2015), **Regulación** o **Práctica**.

| # | Decisión y porqué | Base | Si es incorrecta |
|---|---|---|---|
| F13C-DC1 | La ratificación no exige que quien ratifica sea distinto de quien elaboró o aprobó la versión: es la constancia de una revisión, no una aprobación nueva; exigirlo trabaría a los procesos pequeños | Práctica | Una condición en `validarRatificacion` |
| F13C-DC2 | Ratificar recalcula la huella del archivo en disco y, si no coincide, rechaza y lo deja en la bitácora: confirma que lo que circula es lo aprobado (la comprobación de F13A-DC11) | ISO 7.5.3.1 b) | Se ratificaría un archivo alterado |
| F13C-DC3 | Ratificar y verificar «sigue vigente» no avisan: actúa quien tenía la tarea, y el Admin SGC lo ve en el Semáforo y la bitácora | Práctica | Un aviso por acto al Admin SGC |
| F13C-DC4 | «Fijar próxima revisión» también sobre la selección filtrada del Semáforo, auditado por documento: la carga inicial son unos 200 documentos | Práctica | Fijar uno por uno desde la ficha |
| F13C-DC5 | Las tarjetas del mapa no cambian con el semáforo: cuentan vigentes y un vencido sigue vigente; la señal está en la página del proceso | Práctica | Un conteo de vencidos en cada tarjeta |
| F13C-DC6 | Avisos de vencimiento agrupados por persona y proceso, y silenciados para los documentos de una revisión anual abierta (precedente F13B-DC21): defensa contra la avalancha del primer día | Práctica | Un aviso por documento |
| F13C-DC7 | La adición 5, «sin versionarlos como internos», se lee como «sin trámite»: un externo tiene una versión por edición, y así el índice de una vigente, el Maestro, las copias y los acuses funcionan sin cambios | Reglas de negocio 1 y 2 | Un modelo aparte para los externos |
| F13C-DC8 | `documentos.origen` es la marca que manda; el tipo `DE` es un dato más y la acción rechaza las incoherencias | Práctica | Dos columnas que pueden contradecirse |
| F13C-DC9 | Los datos de un externo van en la tabla `externos`, no como columnas de `documentos` (se aparta del §7 del spec maestro) | Práctica | Ocho columnas nulas en cada interno |
| F13C-DC10 | La adopción es un camino propio que publica con `aplicarPublicacion(…, "externo")` y firma «Adoptó»; la carga directa sigue sin publicar sobre una vigente (regla 10 de `AGENTS.md` ampliada) | ISO 7.5.3.2; regla de negocio 1 | Un trámite por cada edición de un externo |
| F13C-DC11 | Retirar un externo no pide clave: la evidencia es la verificación o el motivo en la bitácora; retirar constata un hecho del emisor | Práctica | Una firma más en el retiro |
| F13C-DC12 | Lo que tiene trámite abierto al abrir la campaña queda «En trámite»; lo publicado o adoptado después entra «Revisado recientemente» | Práctica | El líder decidiría sobre lo que ya está cambiando |
| F13C-DC13 | «Actualizar» sobre un documento con trámite abierto enlaza ese trámite en vez de abrir otro | Regla de negocio 9 | Un segundo trámite que `tramites_uno_abierto_idx` impide |
| F13C-DC14 | Una decisión se cambia hasta que produce firma, verificación o trámite aceptado; cerrada la revisión, un trigger protege sus filas | ISO 7.5.3.1 b); Ley 527 de 1999 | Un clic equivocado sin corrección, o un informe firmado que cambia |
| F13C-DC15 | El PDF del informe lo descargan solo Admin SGC, Gerencia y Control Interno; los líderes ven su proceso en pantalla: el informe lista títulos restringidos de todos los procesos | ISO 7.5.3.1 b) | Títulos restringidos ajenos a la vista de un líder |
| F13C-DC16 | El informe se imprime sobre el formato elegido para él o, sin él, sobre el del acta; el código del encabezado es el del formato | Práctica (F13A-AU1) | El sistema inventaría el código SGC-RG-06 |
| F13C-DC17 | Un cambio de estado de una norma abre un impacto por documento enlazado y uno por proceso asociado sin documentos enlazados | ISO 4.2; 7.5.3.2 b) | Sin evidencia de que el proceso evaluó el cambio |
| F13C-DC18 | «No afecta» exige una nota de al menos 5 caracteres | ISO 7.5.3.2 c) | Una resolución sin razón, que no sirve en auditoría |
| F13C-DC19 | El enlace oficial de una norma se guarda y se muestra como texto, no como hipervínculo | Piso de despliegue, regla 6 | Enlaces hacia fuera desde un servidor que puede no tener salida |
| F13C-DC20 | El PDF de una norma se sirve sin marca de agua a toda sesión: no es un documento del hospital ni una copia controlada | Práctica | Una marca «copia no controlada» sobre un texto ajeno |
| F13C-DC21 | Una relación registrada por error se elimina con motivo; el estado se corrige a mano y los impactos nacidos se resuelven «no afecta» | Práctica | Una máquina de deshacer estados |
| F13C-DC22 | `transicionar` guarda en el evento la fecha límite de la etapa que cierra (`venceEn`); el indicador de etapas en plazo cuenta desde esta entrega | Práctica | Sin historia del plazo que regía al cerrar una etapa |
| F13C-DC23 | Indicadores de estado solo a hoy y de flujo por periodo; la serie mensual de los de estado llega con la foto mensual de la Fase 17 | Práctica | Reconstruir el semáforo de un mes pasado sin las fechas fijadas de entonces |
| F13C-DC24 | La siguiente verificación cerrada del punto valida los hallazgos «por validar» que no vuelven a salir y reabre los que sí | ISO 10.2.1 c) | Un clic de validación por hallazgo |
| F13C-DC25 | La foto de la corrección es opcional y se adjunta al hallazgo (contexto `hallazgo`) | Práctica (F13B-DC13) | Correcciones sin marcar por exigir la foto |
| F13C-DC26 | Miembro «todos» como `tipo = 'todos'` con `referencia_id` nula y `CHECK` | Práctica | Un centinela (0) en las consultas que unen por referencia |
| F13C-DC27 | `firmas.tramite_id` deja de ser obligatoria con un `CHECK` que la exige salvo en «Ratificó» y «Adoptó»; las consultas del acta filtran por trámite | Práctica | Otra tabla de firmas |
| F13C-DC28 | Las revisiones cerradas, con sus procesos y decisiones, son inmutables por trigger; `ratificaciones`, `externo_verificaciones` y `norma_cambios`, de solo inserción: son la evidencia de PC-11 y PC-13 | ISO 7.5.3.1 b); regla de negocio 5 | Evidencia alterable |
| F13C-DC29 | «Vigencia» se muestra también al responsable técnico de un externo, solo con la pestaña Externos y los suyos (precedente F13B-DC19) | Práctica | Un responsable con rol Consulta sin camino a su matriz |
| F13C-DC30 | «Puntos de uso» y «Listas de distribución» se muestran con `distribucion.ver` y las páginas se pintan sin edición para quien no gestiona | Spec 13B §6.4 | Páginas de solo lectura duplicadas |
| F13C-DC31 | La fecha base de lo aprobado fuera de la plataforma es su `fecha_aprobacion`, nunca su `publicado_en` (la carga directa escribe la fecha de carga) | Práctica | Un año de gracia a toda la carga inicial, contra la decisión 1 del usuario |
| F13C-DC32 | Las carpetas de los catálogos salen de `admin/(panel)` a `admin/(catalogos)`, sin el guard del panel, con las mismas URL | Práctica | El líder aterrizaría en «Sin acceso» |
| F13C-DC33 | Página propia de control del externo (`/vigencia/externos/[id]`) para el borrador, la adopción y las verificaciones | Práctica | El líder no entra al panel y la ficha no sirve borradores |
| F13C-DC34 | El alta de un externo no crea acuses salvo casilla explícita; la edición nueva sí; «Requiere socialización» es una casilla del diálogo de adopción | Práctica | Pasar la matriz SGC-MZ-03 al sistema llenaría de tareas a toda la planta |
| F13C-DC35 | El alta y la adopción de externos no dependen de «Publicación directa»; `publicarVersion` rechaza los externos | PC-11 | Cerrar la carga inicial impediría registrar externos para siempre |
| F13C-DC36 | En la revisión anual y en los impactos, un externo se decide por su verificación, nunca por solicitud | Práctica | Un proceso con externos que no se puede completar |
| F13C-DC37 | Con una revisión abierta, ratificar, verificar, adoptar, retirar o pedir una solicitud fuera de su página registra la decisión del documento a nombre de quien actuó | Práctica | El informe cerraría «sin revisar» lo revisado, o alguien haría dos veces lo mismo |
| F13C-DC38 | El PDF del informe se genera al primer pedido desde el informe congelado, como el acta, y vive en `archivos` | Práctica (F13A-R17) | Un PDF generado dentro de la transacción de cierre |
| F13C-DC39 | Las páginas de Vigencia y del normograma usan `exigirSesion` + alcance + `notFound()` (el patrón de `exigirDistribucion`), no `exigirPermiso` | Spec 13A §6.5 | Un «Sin acceso» que revela que algo existe |
| F13C-R1 | La garantía «el acta no cambia» se prueba contra la huella registrada del acta de un trámite cerrado, no byte a byte contra un archivo de referencia (el spec §19.12 pedía comparar el de SOL-2026-001 antes y después) | Práctica | Se pierde la comparación contra un archivo externo, no contra la huella |
| F13C-R2 | La migración siembra los nueve tipos de norma si `tipos_norma` está vacía, en una 0009 mínima e idempotente (precedente F13A-R37): una base de `sgc-suaza` o de la 13B no queda con el maestro vacío | Práctica | Una migración diminuta de más |
| F13C-R3 | La 0009 promueve tres endurecimientos: los triggers de los hijos de una revisión cerrada también en `INSERT` y sobre `NEW.revision_id`, con `FOR SHARE`; `CHECK` de estados en `norma_cambios`; `CHECK` de cierre coherente en `revisiones_anuales` | ISO 7.5.3.1 b) | Restricciones de más, que una migración posterior relaja |
| F13C-R4 | Sin fecha de próxima revisión el semáforo da «Atención · sin fecha de revisión», no «Al día»; el impacto normativo se evalúa siempre; los indicadores sacan del denominador lo que no tiene fecha y lo cuentan «sin dato» (el plan mandaba «al día») | Práctica: nada desactualizado debe pasar inadvertido | Un documento sin fecha base (el `CHECK` lo impide en toda vigente) se vería en atención |
| F13C-R5 | Se ratifican cuatro protecciones de la Tarea 6: retirar descarta el borrador pendiente; un externo retirado no se adopta, edita ni reabre (vuelve como documento nuevo, spec §8.5); el responsable técnico de un restringido debe poder verlo; adoptar recalcula la huella y rechaza con `adopcion_rechazada` | ISO 7.5.3.1 b); regla de negocio 3 | Reactivar un retirado exigiría registrarlo de nuevo, que es lo que dice el spec |
| F13C-R6 | Un externo no entra a un trámite por ningún camino: `crearSolicitud` lo rechaza, `/tramites/nueva` no lo ofrece (ni el tipo `DE`) y tampoco los caminos genéricos del panel y del trámite; origen y tipo `DE` van juntos en la carga directa, la solicitud y la edición del panel (spec §8.1) | Reglas de negocio 9 y 10 | Rechazos de más en caminos que el spec dice que un externo no usa |
| F13C-R7 | Toda verificación reinicia las marcas del aviso; la marca de edición nueva pendiente conserva su primera fecha y la borra una verificación «sigue vigente» posterior, no el descarte del borrador (el spec §8.4 decía «hasta que se adopte») | Práctica | Una edición nueva real marcada «sigue vigente» por error dejaría de recordarse (queda en el historial) |
| F13C-R8 | La tarea «Adoptar la edición nueva» sigue F13A-DC2: los líderes del proceso propietario, y el Admin SGC solo si el proceso no tiene líder activo | Práctica (F13A-DC2) | El Admin SGC no ve en «Mis tareas» las adopciones de procesos con líder (las ve en la matriz, en atención) |
| F13C-R9 | Ruta nueva `GET /vigencia/externos/[id]/archivos/[archivoId]/[[...nombre]]` para abrir los archivos del borrador antes de firmar, con el control de acceso de la página del externo: quien adopta firma su huella | Práctica | Una ruta de lectura de más |
| F13C-R10 | Baja lógica de las relaciones entre normas en una migración 0010 (`eliminada_en`, `eliminada_por`, `eliminada_motivo`, `CHECK` y unicidad parcial): `norma_cambios`, de solo inserción, referencia la relación que derogó y el spec §10.2 exige poder eliminarla | ISO 7.5.3.1 b) | Una migración de más (once en total) y relaciones eliminadas que quedan en la tabla |
| F13C-R11 | La ficha de una norma no nombra ni cuenta los documentos que la persona no ve (decía «Y 1 documento interno restringido que usted no puede ver») | Regla de negocio 3; spec §6.4 | Un auditor sin acceso no sabría que hay restringidos enlazados (los ve quien sí tiene acceso) |
| F13C-R12 (33, 34) | Lo pendiente tiene fila desde la apertura; cuenta como pendiente también la decisión cuyo trámite terminó rechazado o cancelado (la tabla dice «Actualizar · SOL-… · Cancelado» y devuelve los botones), y al cerrar conserva su decisión con el estado del trámite (spec §9.3) | Práctica | Quitar la segunda rama de la definición de pendiente |
| F13C-R13 (35) | En un externo manda el acto más reciente (verificar, adoptar, retirar); siguen fijas la ratificación y el trámite aceptado (el spec §9.3 y el §8.4 se contradecían) | Práctica | El informe diría «Por actualizar» de un externo verificado vigente o retirado después |
| F13C-R14 (36) | Al adoptar, la decisión apunta a la versión adoptada (spec §9.3 sobre §15.2) | Práctica | Dejar de mover `version_id` |
| F13C-R15 (37) | El informe lleva el estado del externo al cierre («Edición adoptada», «Pendiente de adoptar», «Retirado»), aditivo y opcional en `DatosInforme` | Práctica | Quitar el campo y su línea del generador |
| F13C-R16 (38) | Los insumos se congelan al cerrar en cada decisión, con el insumo nuevo «trámites del año» (spec §15.2, §9.2 y §21) | ISO 7.5.3.1 b) | Una columna con datos que no se usan; lo contrario no tiene arreglo tras un cierre real |
| F13C-R17 (39) | Deshacer una carga saca el documento de la foto de la revisión abierta | Práctica | El descartado saldría en el informe como «sin revisar» |
| F13C-R18 (40) | La prórroga suma los días al mayor entre el vencimiento y hoy (el plan sumaba a la fecha anterior) | Práctica | La prórroga de una campaña vencida quedaría en el pasado |
| F13C-R19 (41) | Las cifras de la revisión se acotan al alcance de la persona y el informe parcial no exige el nombre de la entidad | Regla de negocio 3 | Cifras institucionales (conteos, no nombres) a la vista del líder |
| F13C-R20 (42) | La demo nueva, `SEMILLA_RECIEN=1`, los ensayos de migración y los recorridos se hicieron en una base aparte (`sgc_f13c`, con su almacén); la base de desarrollo del usuario no se resembró (el spec §17 decía resembrarla) | Práctica: la base y el `next dev` del usuario no se tocan | El usuario quería su base resembrada: `npm run db:seed && npm run admin:asegurar` |
| F13C-R21 (44) | Del informe no se construye el detalle de las cifras «Ratificados» y «Revisados recientemente» (cuántas firmas, desde qué fecha): la ventana aplicada vive en `revisiones_anuales.ventana_meses` y no se imprime | Práctica | Un campo opcional `ventana` en `DatosInforme` y una línea en el generador, para los cierres posteriores |
| F13C-R22 (45) | La solicitud nacida de la revisión trae la justificación editable «Decisión de la revisión anual <año>: el documento debe actualizarse.» (o «eliminarse») | Práctica | Quitar el valor inicial |
| F13C-R23 (46) | El informe nombra los externos por su edición («CEX-DE-01 ed. 2017») y su ratificación como verificación | Práctica | Volver a «v<n>»; tras el primer cierre real el dato congelado ya no se corrige |
| F13C-R24 (47) | Con la revisión abierta, lo que falta se llama «Pendiente»; «sin revisar» se admite en futuro cuando explica el cierre («quedarán sin revisar») | Práctica | Cambiar dos textos |
| F13C-R25 (48) | Verificar un externo desde la tabla de la campaña no resuelve su impacto normativo pendiente: el impacto conserva su tarea y su página | Práctica | Llevar el id del impacto en la fila y enviarlo desde el diálogo |
| F13C-R26 (49) | La demo siembra un formato propio del informe (`SGC-FO-07`, ficticio) y lo elige; el paso 8 del spec hablaba del membrete del acta | Práctica | Quitarlo de la semilla: el informe de la demo vuelve al formato del acta |
| F13C-R27 (50) | Con valor nulo la tarjeta dice «sin dato», no «sin meta»: la meta siempre existe | Práctica | Una línea en `textoCumple` |
| F13C-R28 (51) | Un vencido con trámite abierto cuenta como vencido en los indicadores 1 y 3 (por la fecha), aunque el Semáforo lo pinte «En trámite»; la tarjeta dice cuántos están en trámite y el Excel trae «Trámite abierto»: un trámite no vuelve vigente la revisión | Práctica | Excluir los que tienen trámite: la cifra cuadraría con el Semáforo y bajaría |
| F13C-R29 (53) | El cumplimiento de un porcentaje se decide con la razón exacta, en enteros, y la conformidad toma la cifra y el veredicto de la 13B; si el entero alcanzaría la meta y la razón no, la cifra lleva un decimal truncado («94,7 %») | Práctica | 18 de 19 se leería «95 % · cumple» frente a una meta de 95 |
| F13C-R30 (54) | El gráfico de vencidos y la tabla por proceso van uno debajo del otro, y lado a lado solo desde `2xl` (la maqueta 9 los ponía lado a lado) | Práctica: a 1280 px la tabla no cabía | Una clase de Tailwind |
| F13C-R31 (55) | La validación automática compara también los ítems fijos y libres por su texto: un hallazgo sin copia ni documento se reabre si la siguiente verificación trae no conforme el mismo ítem | ISO 10.2.1 d) | Un hallazgo «validado» por una verificación que lo encontró otra vez: evidencia falsa |
| F13C-R32 (56) | Si una copia por validar vuelve a salir no conforme, se reabre el hallazgo anterior y el ítem abre el suyo: quedan dos abiertos (spec §12.5) | Spec 13C §12.5 | El responsable ve dos tareas por la misma copia |
| F13C-R33 (57) | Los hallazgos de una recogida («No se encontró») se corrigen, validan y reabren desde la página de su copia, a donde ya llevan su tarea y su aviso | Spec 13C §12.5 | La tarea «Corregir hallazgo» sería un callejón sin salida |
| F13C-R34 (58) | Quien corrigió un hallazgo nunca lo valida, y no lo cierra directamente mientras haya otro Admin SGC activo; si es el único, lo cierra con la marca `propioCorrector` (la regla de «propio punto» de la 13B) | ISO 10.2.1 d); 9.2.2 c) | Con dos administradores, quien corrigió pide al otro que valide; una condición en `cerrarHallazgo` |
| F13C-R35 (59) | `conformidad()` muestra el porcentaje truncado, no redondeado: la cifra entera nunca contradice el veredicto | Práctica | 2 de 3 se ve 66 % y no 67 % |
| F13C-R36 (60) | La fecha de corrección se elige en el diálogo de cierre de la verificación y viaja solo si se cambió (en el ítem se perdía con «Guardar avance») | Práctica | No se anota mientras se responde; devolverla al ítem pide una migración |
| F13C-R37 (61) | La subida de la foto responde 404 a quien no ve el hallazgo y 403 a quien lo ve sin poder corregirlo | Regla de negocio 3 | Un código de estado en la ruta |
| F13C-R38 (62) | El grupo «N documentos por revisar» enlaza al Semáforo de vencidas solo si todos lo están; si no, al Semáforo sin filtro, con el desglose («7 vencidos y 2 en atención») | Práctica | Un grupo que esconde parte de lo que cuenta |
| F13C-R39 (63) | Las tareas de impactos y de adopción no se agrupan: no hay una pantalla que liste los pendientes (las de la revisión anual ya vienen una por proceso) | Práctica | Un líder con muchos impactos ve muchas tareas sueltas; agruparlas es una línea cuando exista la lista |
| F13C-R40 (64) | El ejercicio «ratificar uno, actualizar otro, eliminar otro» del recorrido se hace sobre AIN, que decide la Admin SGC por ser un proceso sin líder; el líder de CEX queda con la solicitud enlazada, el externo y el normograma | Práctica: añadir documentos a CEX cambiaría la demo de la 13A y la 13B al cierre | La demostración del líder decidiendo las tres cosas se ve con la Admin; añadir dos documentos a CEX es una tarde |
| F13C-R41 (65) | Se aceptan los desvíos de la semilla: GTH completo salvo `GTH-PR-01`, que sigue vencido para el paso 2 (el spec se contradecía entre §17 y §19); la ratificación de GTH sobre `GTH-FO-01`; fechas de aprobación relativas; `SGC-FO-07` como formato del informe | Práctica | Cambios de datos en la semilla, sin efecto en la aplicación |

## Decisiones adicionales (Fase 14A)

F14-DC1 a F14-DC42 vienen del spec de la Fase 14 (§28), del 2026-11-10; aquí van las que rigen en la 14A (DC24 a DC28, DC33,
DC35, DC37 a DC39 y DC42 son de la 14B y están en el spec). Las decisiones del usuario están en el §2 del spec. F14A-R1 a
R53 son las resoluciones del controlador durante la ejecución (2026-11-10 a 2026-11-12) que cambian lo que el usuario ve o
hace, o lo que el spec decía; entre paréntesis, la tarea del plan en que se tomó (la bitácora de ejecución las guarda con
su contexto; R41 a R50 son de la ronda 1 de la Tarea 19, tras el recorrido del controlador, con el defecto que corrigen, y
R51 a R53, de la ola final de corrección tras la revisión de toda la rama, con su hallazgo). Mandan sobre el plan. Base: **ISO** (cláusula de 9001:2015), **ISO derivada** (la cláusula respalda el fin;
el mecanismo es de Claude), **Regulación** o **Práctica**.

| # | Decisión y porqué | Base | Si es incorrecta |
|---|---|---|---|
| F14-DC1 | La gráfica principal va siempre en columnas (tubos): es la del Excel y la que sirve con cuatro, dos o un periodo al año | Práctica | Una gráfica de línea para los mensuales |
| F14-DC2 | Plazo de reporte, inicio de medición, soporte obligatorio, nivel de acceso y personas son datos de operación: fuera de la ficha firmada y, en el impreso, en un bloque aparte | ISO derivada de 7.5.3.2 c) | La ficha aprobada cambiaría sin cambiar de versión |
| F14-DC3 | El cierre no alcanza lo que sigue en su plazo de reporte ni los históricos sin registrar | Práctica | Cerrar el 1 de abril dejaría sin dato lo que tenía plazo hasta el 10, y el primer cierre bloquearía la historia por llenar |
| F14-DC4 | La meta base es opcional: sin meta, «Sin meta» en gris y sin alertas | Práctica | Toda ficha exigiría una meta, también las que solo vigilan |
| F14-DC5 | El soporte admite PDF, imagen y `.xlsx`; no `.xls`, Word, comprimidos, SVG ni HTML; siempre se descarga | Spec maestro §5.5 | Un `.xls` se confundiría con un `.doc` |
| F14-DC6 | Las fichas no entran al Listado Maestro: su control vive en el módulo, con su lista y su Excel | ISO derivada de 7.5.3 | Las fichas en el Maestro con códigos que no son de documento |
| F14-DC7 | La sigla `IND` queda reservada en Tipos de documento | Práctica | `SGC-IND-01` se confundiría con un documento |
| F14-DC8 | Las firmas de una ficha van en `firmas`, con la huella del contenido de la versión y nombre y cargo congelados | ISO derivada de 7.5.2 c); Ley 527 de 1999 | Otra tabla de firmas |
| F14-DC9 | El cierre del mes no pide clave: es rutina mensual y cada medición se reabre con justificación | Práctica | Una firma más cada mes |
| F14-DC10 | El Admin SGC no reporta mediciones ordinarias salvo que esté designado o que nadie más pueda (marca `sinMedidor`) | ISO derivada de 9.1.1 b) | Quien cierra el mes produciría los datos que cierra |
| F14-DC11 | No se reporta un periodo que no ha terminado | Práctica | Datos de un periodo que todavía no existe |
| F14-DC12 | Cada medición es una fila que se abre al terminar el periodo, y toda lectura del módulo lo asegura | Práctica | Un planificador, que el piso de despliegue no tiene |
| F14-DC13 | `medicion_eventos` y `medicion_observaciones` de solo inserción; mediciones cerradas y versiones aprobadas inmutables por trigger | ISO derivada de 7.5.3.1 b) | Evidencia alterable, o un historial que solo vería quien ve la bitácora |
| F14-DC14 | El intérprete calcula con fracciones exactas y solo admite cuatro operaciones, paréntesis y `min`, `max`, `abs`, con punto y coma entre argumentos | ISO derivada de 9.1.1 b); seguridad | Errores de coma flotante o más superficie para una fórmula hostil |
| F14-DC15 | Reglas del semáforo en descendente y en constante; con meta 0 en descendente, rangos fijos | Práctica | El Excel solo define el ascendente |
| F14-DC16 | El acumulado se juzga contra la meta del último periodo medido, dice «parcial» si falta algo y cubre solo la versión vigente si cambió el cálculo | ISO derivada de 9.1.1 b) | Un acumulado que mezcla fórmulas o se juzga contra una meta que ya no rige |
| F14-DC17 | Un cambio mayor rige desde un periodo aún no reportado y nunca desde uno que no ha empezado | ISO derivada de 7.5.3.2 c) | Recalcular lo ya medido o una vigencia en fecha futura (Fase 16) |
| F14-DC18 | Código fijo tras la primera aprobación; retiro definitivo; se borra solo lo que nunca se envió y lo enviado sin aprobar se descarta conservando su código | Práctica (D47) | Un retirado que revive confunde su historia; una firma no se borra |
| F14-DC19 | Sin un líder distinto de quien elaboró, aprueba Gerencia; el aprobador puede devolver con nota | Spec maestro §5.1 | Un proceso sin líder trabado |
| F14-DC20 | El incumplimiento repetido no cambia el color: añade la insignia, la alerta crítica y el análisis en dos partes; «no aplica», «sin dato» e históricos ni cuentan ni rompen la racha | Práctica | El color dejaría de decir el resultado del periodo |
| F14-DC21 | Una observación genera la tarea de responderla para quien analiza | Práctica | Una observación sin respuesta solo se vería en el resumen del cierre |
| F14-DC22 | El Excel lo descarga quien ve lo que exporta; lo que no ve, 404 | Práctica | «Imprimir» separado de «consultar» |
| F14-DC23 | Las animaciones son CSS; `motion` no está instalada y no se añade | Stack | Una dependencia nueva |
| F14-DC29 | La `0011` crea todas las tablas de la fase; la `0012` queda para los ajustes de la 14B | Práctica | La 14B alteraría lo que construyó la 14A |
| F14-DC30 | La alerta sale cuando el resultado queda calculado, aunque falte el análisis | Práctica | Quien analiza se enteraría tarde |
| F14-DC31 | Una medición reabierta se cierra con el siguiente cierre o con «Cerrar de nuevo» | Práctica | Una corrección abierta sin fin |
| F14-DC32 | La insignia de «Indicadores» cuenta las mediciones vencidas a cargo de la persona | Práctica | Otra insignia que contar |
| F14-DC34 | El aviso de escalamiento no nombra el indicador | Regla de negocio 3 | Un jefe sin acceso conocería un restringido |
| F14-DC36 | La aprobación en bloque es todo o nada | Práctica | Firmas a medias |
| F14-DC40 | Cada versión guarda los textos de los catálogos como se firmaron y la huella va sobre ellos; el proceso queda fijo tras la primera aprobación y el subproceso es cambio menor | ISO derivada de 7.5.3.2 c) | Renombrar un cargo cambiaría una ficha aprobada |
| F14-DC41 | Los históricos programan su meta sin justificación, no llevan «Requiere acción de mejora» y no cuentan para el incumplimiento repetido | Práctica | Digitar la historia crearía pendientes y cambiaría marcas ya puestas |
| F14A-R1 (preparación) | La fase corrió en un worktree aparte (`F:\sgc-integral-f14a`), con la base `sgc_f14a` y el almacén `almacen-f14a`, por decisión del usuario; su base `sgc` y su `next dev` no se tocaron (precedente F13C-R20; se aparta de F13B-R1, que trabajó en la carpeta principal) | Práctica | Resembrar la base del usuario: `npm run db:seed && npm run admin:asegurar` |
| F14A-R2 (T13) | «Mis tareas» solo lee: los periodos los abren la revisión de vencimientos del cascarón y las páginas del módulo, así que una tarea nueva aparece a lo sumo una carga después (el spec §8.1 contaba «Mis tareas» entre las lecturas que abren) | Práctica: el cascarón no escribe | Abrir periodos en cada página del cascarón |
| F14A-R3 (T4) | La cifra mostrada se redondea; si contradice el color, se trunca, y si aún contradice (descendente justo sobre la meta), con más decimales truncados, hasta diez | Spec §7.5 | Un decimal de más en los bordes |
| F14A-R4 (T4) | En tendencia constante, «Cumple: X dentro del rango de A a B.» y «No cumple: X fuera del rango de A a B.»; con un solo valor, «… frente a una meta de A.»; la flecha no dice «mejora» ni «empeora» en constante ni sin cambio | Spec §8.3 | Una palabra en la frase |
| F14A-R5 (T4) | Los rangos en palabras parten los valores como los muestra la cifra: descendente «Bien hasta M · Atención de más de M a L · Crítico por encima de L»; ascendente «Atención de L a M menos un paso» si M cae en los decimales de la unidad, si no «de L a menos de M»; la tolerancia de un porcentaje, en puntos | Spec §7.5 | El texto del semáforo en los bordes |
| F14A-R6 (T4) | El semáforo relativo se rechaza con meta 0 o negativa en ascendente y negativa en descendente: hay que escribir rangos fijos | Práctica | Una ficha con un semáforo que no se puede calcular |
| F14A-R7 (T4) | En el acumulado, un periodo al que le falta alguna variable cuenta como sin dato | Práctica | A y B sumarían periodos distintos |
| F14A-R8 (T4) | Lo firmado (la huella) es el contenido de §7.2 con los nombres firmados; quedan fuera los datos de operación, el estado, el número, el tipo y el motivo del cambio y «rige desde» | ISO derivada de 7.5.3.2 c) | Un cambio de «rige desde» o del motivo cambiaría la huella |
| F14A-R9 (T4) | «Mayor» o «menor» compara las referencias a catálogo por su id: renombrar una unidad o una clasificación es editorial y un cambio solo de su nombre o su sufijo no pide aprobación | Spec §7.2; F14-DC40 | Tras renombrar una unidad, toda edición de la ficha pediría aprobación |
| F14A-R10 (T6) | El código propuesto es 1 más el mayor número usado con ese prefijo en cualquier estado (no se reusan); `nuevo`, `matriz`, `por-aprobar`, `cierre` y `excel` están reservados; mover un borrador de proceso repropone el código | Spec §7.1 | Un número saltado tras un descarte |
| F14A-R11 (T6) | En un cambio sobre una ficha aprobada, los datos de operación se ven en solo lectura con la nota de que se cambian en «Datos de operación» | ISO derivada de 7.5.3.2 c) | Un «Restringido» en el formulario que no hace nada |
| F14A-R12 (T6) | Una norma derogada no puede quedarse en un cambio de la ficha: se sustituye por la vigente | Spec §17.1 | El administrador debe cambiar la norma antes de guardar cualquier cambio |
| F14A-R13 (T7) | «Quién mide» nace en «(el líder del proceso)», no en quien crea la ficha; sin persona, los cargos nacen con los de los líderes del proceso, y un error de un campo de «Más opciones» abre la sección y lleva el foco a él | F14-DC10; spec §12.4 | El administrador se elige a sí mismo a mano |
| F14A-R14 (T7) | «Rige desde» propone el primer periodo sin reporte, que es también el más temprano admitido; si no hay uno válido, el diálogo dice desde cuándo podrá enviarse el cambio en vez de pedir la clave | Spec §7.6 | Un periodo propuesto que el servidor rechaza |
| F14A-R15 (T7) | Un cambio mayor que pasa a una periodicidad más gruesa a mitad de periodo no puede regir hasta que empiece el siguiente periodo sin reportes; queda para el usuario decidir si la Fase 16 necesita otra regla | F14-DC17 | El cambio espera hasta el próximo periodo de la periodicidad nueva |
| F14A-R16 (T7) | Un cambio menor rige para los mismos periodos que la versión que reemplaza: los históricos los rige la de mayor número entre las del primer «rige desde» | Spec §7.6 y §8.8 | Un histórico con la versión de antes del cambio menor |
| F14A-R17 (T7) | A quien no le toca aprobar una ficha, el mensaje es «La ficha no existe o no le corresponde aprobarla», sin revelar el código de lo que no se envió | Regla de negocio 3 | El código de un borrador ajeno |
| F14A-R18 (T8) | «Medición con datos» son valores, análisis, causa, acción propuesta, eventos, observaciones o soportes; retirar y correr el inicio de medición hacia adelante quitan solo las abiertas sin datos | Spec §7.7 | Una medición vacía que se queda abierta, o un soporte huérfano |
| F14A-R19 (T8) | El aviso de designación sale también al aprobarse la versión inicial; un retirado no se vuelve a designar; «Crear a partir de este» copia los designados activos y limpia subproceso y procedimiento si cambia de proceso | Spec §10.4 | Un aviso de más, o un retirado con quién cierre lo pendiente |
| F14A-R20 (T9) | «Guardar sin reportar» no es un reporte: no deja evento, no congela versión ni meta, no alerta aunque esté completo y deja su propia línea en la bitácora («Guardó sin reportar una medición de indicador») | Spec §8.2 | Un borrador sin historia en la medición, que la bitácora sí guarda |
| F14A-R21 (T9) | Quitar «no aplica» es una corrección; marcarlo, su propia acción; un histórico reportado después cuenta como corrección | Spec §8.7 | Otro nombre de acción para filtrar aparte |
| F14A-R22 (T9) | Para «rige desde», una medición abierta con todos los datos o «no aplica» cuenta como reportada | F14-DC17 | Un cambio mayor rige un periodo más tarde |
| F14A-R23 (T9) | Un cambio de periodicidad empieza en una frontera común (de bimestral a trimestral, en enero o julio); al aprobarlo se quitan las mediciones abiertas sin datos de la periodicidad vieja, y las que tienen datos quedan sin tareas ni cierre | Spec §7.6 y §8.1 | Un mes medido dos veces, o mediciones que nadie puede reportar |
| F14A-R24 (T10) | Los históricos entran solo por la tabla del año: reportar y «no aplica» los rechazan, y la tabla admite «No aplica» por fila con su motivo (la fila marcada ignora sus valores) | Spec §8.8 | Un histórico no se digita desde la pantalla de reporte |
| F14A-R25 (T10) | «Programar metas» trabaja sobre el año que muestra la página | Spec §8.9 | La meta de enero del año siguiente no se programa en diciembre |
| F14A-R26 (T11) | Un soporte `.xlsx` se valida sobre el archivo completo: el ZIP renombrado, que el spec aceptaba como riesgo residual (§8.2 y §21), queda cerrado en los soportes | Regla de negocio 6; seguridad | Una lectura más del archivo en cada subida de Excel |
| F14A-R27 (T12) | El resumen del cierre lleva la tabla «Por proceso» (spec §9.2) y se guarda con el cierre | Spec §9.2 | Una tabla de más en la pantalla |
| F14A-R28 (T12) | El cierre admite un mes anterior al último cerrado (por la dirección); rechaza solo el mismo mes y uno sin terminar | Spec §9.1 | Un cierre «fuera de orden» posible por URL |
| F14A-R29 (T12) | `diaLocal` guarda su formateador de fechas por zona: un caché de módulo que comparten trámites e indicadores, sin cambio de comportamiento | Práctica: el cierre recorre todos los indicadores activos | Un formateador por llamada, más lento |
| F14A-R30 (T13) | Un crítico sin alerta previa es una alerta nueva, no una corrección; lo que el Admin SGC tiene de respaldo no se escala; las mediciones de otra periodicidad no dan tareas ni avisos | Spec §10.2 y §10.3 | Cambia el tipo y el texto del aviso, no sus destinatarios |
| F14A-R31 (T14) | Las gráficas nunca se encogen por debajo de su proporción: con muchos periodos se desplazan y arrancan en lo más reciente | Spec §11 | Un desplazamiento lateral en cada tarjeta de variable |
| F14A-R32 (T15) | La celda de la matriz lleva una figura por estado además de la franja de color (se aparta de la maqueta 5) | `AGENTS.md`; WCAG 1.4.1 | Quitar tres íconos |
| F14A-R33 (T15) | La lista escribe la flecha y «mejora» o «empeora» aunque la miniatura tenga un solo periodo; un periodo por venir lleva «—»; quien administra ve los borradores en la lista, sin contarlos en la barra | Spec §8.3 y §12.2 | La comparación escondida en la lista |
| F14A-R34 (T16) | Bitácora `exporto_ficha_indicador` (el spec decía `exporto_indicador`, que se confunde con `exporto_indicadores` de la 13C) y `exporto_resultados_indicadores` | Práctica | Renombrar una acción y su frase |
| F14A-R35 (T16) | El Excel de resultados es el de la lista con sus filtros más el año (código, nombre, proceso, subproceso, clasificación, tipo, unidad, meta, doce meses y año); el de la matriz incluye los retirados | Spec §13 | Menos columnas o filas vacías de más |
| F14A-R36 (T16) | La ficha impresa de un año usa la versión que regía ese año; la tabla va en orden de periodo, en tramos consecutivos con el rótulo de su versión | Spec §7.8 | Imprimir la vigente para años pasados |
| F14A-R37 (T16) | «Saltar al contenido» no se imprime en ninguna página (regla global de impresión) | Práctica | El enlace al pie de cada hoja impresa |
| F14A-R38 (T17) | La búsqueda incluye los retirados, marcados «Retirado» (nunca borradores, descartados ni restringidos ajenos) | Spec §12.8 | Un filtro más |
| F14A-R39 (T17) | Si la lectura de los indicadores de la página del proceso falla, la sección no sale y queda en el registro: los documentos (7.5) nunca caen por ella | Práctica | Una sección que falta en silencio para el usuario |
| F14A-R40 (T18) | La demo: el calendario se cuenta desde la siembra con el plazo de reporte (10 días) como umbral, no se fuerza un «por reportar» dentro de su plazo, y la siembra deja leídos los avisos que su propia historia ya resolvió | Práctica; F12-D35 | Avisos viejos sin leer o fechas fijas que envejecen |
| F14A-R41 (T19, D-1) | El `.xlsx` de un soporte se lee entero (hasta 25 MB) y se valida con `fileTypeFromBuffer`, nunca con `fileTypeFromFile`: su `import()` de especificador no literal no sobrevive al empaquetado de Next y todo `.xlsx` respondía 500 (Vitest no empaqueta: las pruebas pasaban). `tests/file-type-empaquetado.test.ts` impide volver a importarlo | Regla de negocio 6; Práctica | 25 MB en memoria en la subida de un Excel; `serverExternalPackages` era la otra salida |
| F14A-R42 (T19, D-2) | El lienzo de una gráfica de tubos mide según sus periodos (34 px por columna, con un tope de 1,3 veces su proporción; desde la ola final, M7, una serie corta ensancha sus columnas hasta que el valor quepa con su unidad, sin pasar de lo que ocupan seis a 34 px); si se desplaza y la última columna con valor queda cortada, al cargar se corre hasta mostrarla, y siempre arranca con el borde izquierdo de lo visible en el de una columna: la que quedaría partida queda fuera, con un relleno a la derecha de menos de una columna si hace falta (`desplazamientoInicial`, residuos de la ola final; a 390 px el «83,3 %» de `SGC-IND-01` se leía «3,3 %»). Sin JavaScript arranca en lo más reciente, como antes | Spec §11; F14A-R31 | Un trimestral a 390 px enseñaba solo el periodo por venir |
| F14A-R43 (T19, D-3) | Elegir la forma sugiere su unidad: porcentaje, la de «%»; una tasa por mil, la de «por mil»; las demás, la que no lleva sufijo. Cambiar el factor también la sugiere; la persona puede elegir otra | Práctica | Un conteo quedaba en «%» |
| F14A-R44 (T19, D-7 y D-8) | El límite de crítico de la gráfica es uno solo si todos los periodos tienen el mismo, y si no uno por periodo, escalonado con la meta; la etiqueta y el pie accesible usan `textoDelLimite` y la pantalla de reporte («Así quedará el semáforo») `rangosEnPalabras`, que dicen el mismo número (lo fija `tests/indicadores-limite-grafica.test.tsx`) | Spec §11; regla del veredicto con el valor exacto | Dos cifras para un mismo límite, o una punteada plana con metas programadas |
| F14A-R45 (T19, D-9) | Un retirado sale en la matriz (pantalla, impresión y Excel) con la marca «Retirado» («(Retirado)» tras el nombre en el Excel), y sus periodos sin medición desde el retiro quedan vacíos, como los de antes del inicio (no se miden), no «por venir» | Spec §6.4 | Un indicador retirado que parece pendiente |
| F14A-R46 (T19, D-10) | Cada ficha de la demo trae su línea base en una de las dos formas: `AIN-IND-01` (34 min) y `CEX-IND-01` (3,4 días) con valor y periodo 2025; las demás, «Sin línea base: <año> es el año de referencia» | Spec §7.2 | El primer cambio de una ficha sembrada sumaba «Nota de la línea base» a lo que cambió |
| F14A-R47 (T19, D-11) | La barra de la lista cuenta «No aplica» aparte (segmento neutro rayado; el texto lo nombra solo si hay alguno); «Sin meta» sigue contando con «sin dato» | Spec §24.8; WCAG 1.4.1 | «No aplica» confundido con «Sin dato» |
| F14A-R48 (T19, D-12) | Reportar un periodo que queda pidiendo análisis (Atención o Crítico) vuelve a la página del indicador con `foco=analisis`, y el foco va a la sección **Análisis** | WCAG 2.4.3; Práctica | El análisis obligatorio a 22 `Tab` y sin anuncio |
| F14A-R49 (T19, D-13) | Un error del servidor sobre un campo de la ficha sale junto a él (`aria-describedby`), y el foco va a él, abriendo los plegables que lo contienen; al pie solo quedan los que no son de un campo | WCAG 3.3.1; Práctica | El error lejos del campo y el foco en `body` |
| F14A-R50 (T19) | Devolver una ficha vuelve a «Por aprobar» con `devuelta=<código>` y la página confirma «Se devolvió la ficha de … a borrador, con su nota.», como la aprobación en bloque; solo repite un código bien formado | Práctica | Quien devuelve no veía confirmación |
| F14A-R51 (ola final, C1) | Una norma que cita una ficha de indicador (de cualquier versión, también un borrador) o un impacto de indicador tiene historia: no se borra, se retira, con el mensaje legible «La norma tiene historia: retírela». El servidor decide si ofrece «Borrar la norma» con la misma regla (`historiaDeNorma`, que también cuenta las relaciones eliminadas), no la ficha con lo que muestra | D47 (13C); Práctica | El Admin veía el error crudo de la llave foránea en inglés |
| F14A-R52 (ola final, I1) | Cambiar el plazo de reporte mueve la fecha límite de las mediciones sin cerrar y no históricas y limpia los avisos que ya no son ciertos: el de vencido y el escalamiento si la fecha nueva aún no llega (se avisan otra vez cuando venza), el previo si la fecha quedó más lejos que los días del aviso previo; los que siguen siendo ciertos se conservan. «Soporte obligatorio» **rige hacia adelante** (residuos de la ola final): desactivarlo recalcula todas las mediciones en curso (la que solo esperaba el soporte queda reportada y deja de ser tarea); activarlo, solo las que siguen en plazo (una reportada sin soporte vuelve a abierta para pedirlo), y lo reportado a tiempo cuyo plazo ya pasó se queda reportado, sin volverse vencido ni escalarse; tampoco lo reabre después la racha de los siguientes. La bitácora cuenta cuántas tocó | Spec 3.16, §7.3, §8.2, §10.2; Práctica | Ampliar el plazo no evitaba el aviso de vencido ni el cierre en «sin dato»; desmarcar el soporte dejaba la tarea, y marcarlo volvía vencido lo reportado a tiempo, con aviso al jefe |
| F14A-R53 (ola final, I2) | Corregir, reabrir, reportar tarde, marcar «no aplica» o reprogramar la meta de un periodo que cambia de semáforo o de resultado recalcula el incumplimiento repetido de los periodos siguientes que su racha alcanza (los n − 1 primeros medidos), con el evento `recalculo` a nombre de quien actuó, que dice qué pasó con la marca; el historial lo cuenta como «Se recalculó por la racha de periodos anteriores». Los cerrados no cambian (se reabren a mano); cada siguiente conserva la versión con que se calculó, la falta de un soporte que se volvió obligatorio después no la reabre, y sus avisos siguen el último nivel alertado | Spec §10.3; Práctica | Una marca «Requiere acción de mejora» que ya no era cierta, o una que faltaba |
| Pedido del usuario (2026-11-13) | La matriz del año filtra también por subproceso (año, proceso, subproceso y clasificación): el de la versión aprobada vigente del indicador, como la lista; rige en pantalla, al imprimir y en el Excel | Práctica |

## Deuda técnica conocida

**De la entrega complementaria de la 14A** (rangos, códigos e importación; menores, por módulo): está en su sección, «Deuda técnica
(entrega complementaria de la 14A)», con la nota para la 14B de `condicionDeDeshacer`.

**De la Fase 14A** (todos menores; son los «minor (deferred)» de la bitácora de ejecución que siguen abiertos y lo que la
revisión final de toda la rama (2026-11-12) adjudicó como deuda, agrupados por módulo; los que una tarea posterior o la ola
final de corrección resolvió ya no están: la partición de `mediciones.ts` en `lectura.ts`, `lista.ts` y `matriz.ts`, el
acento de la tarjeta del resultado en vivo, la nota del ZIP renombrado, las columnas de un año con versiones de letras
distintas, la racha de los periodos siguientes (F14A-R53), «soporte obligatorio» y el plazo en las mediciones abiertas
(F14A-R52), el `],` de `firmas` en `esquema.ts` y el 409 de un soporte repetido):

- **Esquema y triggers:**
  - La excepción de reapertura de `sgc_impedir_si_medicion_cerrada` no limita qué otras columnas cambian en el mismo
    `UPDATE` (spec §19.4: «el único cambio que admite es la reapertura»); no escala porque la fila reabierta es editable.
    Dos reaperturas de la misma medición en una sola transacción con la misma hora chocan con el trigger (42501).
  - Los triggers de las hijas toman el padre `FOR SHARE`: un camino nuevo que escriba filas hijas y después actualice el
    padre sin tomarlo antes `FOR UPDATE` puede dar un interbloqueo (40P01). Reportar, «no aplica», metas y soportes siguen
    ese orden.
  - Dos nombres de FK de más de 63 caracteres: Postgres los trunca y `db:preparar` imprime dos NOTICE más.
  - Sin índices sobre `firmas.indicador_version_id`, `medicion_observaciones.responde_a` ni `mediciones.cierre_id`
    (revisión final, M2): van en la próxima migración, porque la `0011` ya se aplicó y no se cambia; hoy las consultas que
    los usarían son baratas.
  - Para la 14B (la `0012` puede rehacerlas, spec §19.5): `dimension_categorias.activo` frente a «activa» del spec, y
    `reportes_externos.desde`/`hasta` como `date` frente a `timestamptz` en `mediciones`.
  - `borrarIndicador` no comprueba `impactos_indicadores` ni `indicador_variables.indicador_origen_id` (14B): daría un
    23503 crudo.
- **Intérprete y reglas puras:**
  - Mensajes con la causa equivocada para `1,`, `,5` («Separe los argumentos…») y `1.`, `.5`, `1.2.3` («Carácter no
    admitido: «.»»); un carácter astral se describe como medio carácter; `enPalabras` devuelve la fórmula cruda si no se
    puede leer y escribe «−−» con dos menos seguidos.
  - `FACTORES_TASA` es un arreglo mutable; `evaluar` no acota el valor de una variable ni rechaza `null` en ejecución; una
    rama inalcanzable en `fraccion.ts`.
  - `textoValor` en el tope de diez decimales aún puede contradecir a menos de 1e-10 del borde, y con más de 15 cifras
    enteras devuelve el redondeado; un límite periódico (42,857…) se escribe «42,85».
  - `partes(clave)!` lanza un `TypeError` sin nombrar la clave (`periodos.ts`); `variacionExcesiva` redondea en silencio un
    porcentaje no entero; `abs` duplicado y un ciclo de tipos entre `semaforo.ts` y `textos.ts`.
  - La huella excluye los ids de clasificación y unidad: dos entradas de catálogo con el mismo nombre y sufijo darían la misma
    huella aunque `tipoDeCambio` diga «mayor». La fórmula libre se guarda como se escribió («A × B» y «A * B» son un cambio
    mayor por los glifos).
  - Huecos de prueba: límites de profundidad por menos unario y por función, el borde de 200 dígitos, los campos mayores
    añadidos (cálculo, alcance del cálculo, dimensión, meta máxima).
- **Ficha y aprobación:**
  - `FormularioFicha.tsx` (952 líneas, unos 35 estados), `aprobacion.ts` (965 líneas con seis lecturas) y `fichas.ts` (947):
    partirlos si la 14B los extiende; `PERIODICIDAD`, `ESTADO_VERSION` y `separarFirma` repetidos; formateadores puros
    (`etiquetaDePeriodo`, `desdePeriodo`) en un módulo de base y reimplementados en `bitacora-detalle.ts`; `concat_ws` del
    nombre de la norma duplicado.
  - `campoDeMasOpciones` reconoce los mensajes del servidor por expresión regular (un mensaje reescrito deja de abrir «Más
    opciones»); `?aprobadas=N` se añade tras `rutaInterna` y se repite al refrescar; `usuarioActual` sin uso en
    `OpcionesFicha`; `DescartarCambio` sin título visible.
  - N+1 en `fichasPorAprobar` y en la cuenta de la pestaña; `fichaDeVersion` repite `versionesVisibles`.
  - Las listas de personas muestran solo el nombre (con homónimos, «nombre · cargo» desambiguaría).
  - `primerSinReporte` devuelve el último candidato sin frontera común si no la encuentra en doce pasos (no lanza;
    `validarRige` lo rechaza).
  - Una persona con dos funciones recibe dos avisos al aprobarse la versión inicial.
  - `tipos.ts` importa `ErrorTramite` como valor desde `flujo/contrato.ts`: seguro mientras ese archivo solo tenga
    `import type`.
  - `?devuelta=` se toma de la URL, como `?aprobadas=` (solo repite, escapado, un código bien formado: alguien puede
    armar un enlace que confirme una devolución que no hizo); con `operacionFija`, un error del servidor sobre
    `ficha-nivelAcceso` o `ficha-inicioMedicion` sale al pie y no junto a su campo (caso extremo).
- **Medición, soportes y cierre:**
  - Abrir los periodos no tiene una precomprobación barata (revisión final, M5): cada lectura que los asegura abre una
    transacción por indicador aunque no haya terminado ningún periodo nuevo; una consulta previa («¿algún periodo terminado
    sin medición?») la evitaría.
  - La carrera heredada de `recibirArchivo` (código de `main`, no de esta fase): dos subidas simultáneas con el mismo nombre
    ven libre la misma ruta, y la que pierde (al abrir el archivo con `wx` o en el 23505 de la ruta) borra en su `catch`
    el archivo de la otra, que queda con su fila y sin su archivo. Afecta a todas las subidas, no solo a los soportes.
  - N+1 en `registrarHistoricos` (hasta 60 filas); `?registrados=` se toma de la URL; sin prueba de carrera del candado de
    `programarMeta`.
  - `file-type` puede no reconocer un `.xlsx` escrito con descriptores de datos (`streamFiles`) y una hoja de más de 1 MB,
    que entonces se rechaza como soporte: así lo anotó la revisión de la Tarea 11 en la bitácora, sin reproducirlo aquí.
    El tope de 1 MiB por entrada es de `file-type` (`detectors/zip.js`) y sigue con `fileTypeFromBuffer` (F14A-R41); el
    manual, capítulo 8, sección 3.4, dice qué hacer si un Excel legítimo se rechazara.
  - `registrarArchivo` pasa una hora fija a `dejarSoporteSubido` y arma el sujeto desde `usuarios`; ciclo de importación
    `admin.ts` ↔ `indicadores/soportes.ts`; consultas de candado repetidas en `bloquearParaSoporte`; la fila «sin dato» con
    `colSpan` esconde la columna Soportes; sin pruebas de quitar con `sinMedidor` ni del 429.
  - «Reabrir» y la zona de carga de soportes necesitan JavaScript; el camino 23505 del cierre no tiene prueba.
  - Las mediciones de respaldo (sin designado ni líder) nunca se marcan escaladas y se vuelven a resolver en cada pasada
    (costo, no error).
  - Acortar el plazo de reporte de forma retroactiva dispara el aviso de vencido y el escalamiento en la misma pasada, y el
    aviso previo ya mandado puede quedar con la fecha vieja en su texto (`marcasQueSiguen`, `src/lib/indicadores/periodos.ts`).
- **Pantallas, gráficas y Excel:**
  - Las series largas tienen una parada de `Tab` por columna (falta el `tabindex` itinerante); sin JavaScript, con un
    desborde de pocos píxeles, el desplazamiento que arranca en lo reciente corta el rótulo del año del primer periodo
    («025»); con JavaScript arranca en el borde de una columna (`desplazamientoInicial`, F14A-R42).
  - `resultadosDeLaLista` e `impresionDelAnio` leen las versiones dos veces; la hoja impresa usa tablas propias y no
    `TablaDatos` (excepción aceptada); `tests/handlers-permisos.test.ts` no lista las rutas nuevas (las prueban
    los archivos de prueba del módulo, como `indicadores-excel`).
  - La prueba de la paleta solo prueba `GrupoPaleta` con el título a mano; un grupo de subproceso con nombre nulo saldría
    vacío en `lista.ts`; la ficha de la norma no tiene prueba de integración de «Indicadores que exige» con indicadores (la
    de la ola final la pinta cuando su lectura falla).
  - El ancho del valor bajo cada tubo se estima (0,6 de la letra por carácter; no hay medida de texto en el servidor): la
    unidad que vuelve con la ola final (M7) y la franja ensanchada de una serie corta no se comprobaron en el navegador, y
    la prueba de que los valores no se enciman usa la misma estimación que el componente.
- **Normograma (13C, tocado en la 14A):** `tieneHistoria` viaja en el objeto `Norma` también a quien no administra (un
  booleano que no usa; impacto despreciable).
- **Maestros y parámetros:** sin respaldo `catch 23505` en `guardarEnMaestro` (solo la comprobación bajo `LOCK`);
  `DatosMaestro` no es una unión discriminada; la prueba de «borrar solo si nadie lo usa» y del nombre repetido cubre solo
  `tipos`; «Borrar» un maestro no pide confirmación; la constante `ORDEN` tiene un nombre engañoso.
- **Alcance:** `lideresActivos` recibe `procesoId` con un tipo raro (`ReturnType<Cliente>`).
- **Semilla y pruebas:** en `semilla-indicadores`, la aserción de los avisos resueltos y leídos es dura (un aviso nuevo de
  esos tipos tras la siembra la hace fallar en vez de saltar) y `leerAvisosResueltos` acota por tipo, no por indicador; el
  primer commit de la Tarea 10 (`0184382`) deja `bitacora-detalle` en rojo (rompe la bisección); huecos de prueba de la
  `0011`: `INSERT` en `indicador_normas` bajo una versión aprobada, la unicidad `indicador_normas_unica`, `UPDATE` y
  `DELETE` de `medicion_observaciones` con el dueño, y el test de la siembra no compara contra las constantes de
  `minima.ts`. «Worker exited unexpectedly» de Vitest, intermitente (revisión final, M11): se vio en primeras corridas de
  las Tareas 9 y 18, sin pruebas fallidas; vigilarlo en el CI.

**De la Fase 13C** (todos menores; son los «minor (deferred)» de la bitácora de ejecución que siguen abiertos, los hallazgos
del recorrido final del controlador, los de la revisión de la documentación y los menores de la revisión final de la rama
(F-M1 a F-M10) que no entraron en su corrección, agrupados por módulo. La bitácora está fuera de git: esta lista es la que
queda. La corrección final resolvió y quitó de aquí W1, W2, W3, N1, N2, los textos de la Configuración documental, el
import de `condicionVista`, el cierre directo de un hallazgo del propio punto (F-I4) y las fotos del cascarón (F-M10)):

- **Registro de riesgos (spec §22) y los que aparecieron:**
  - La paleta `Ctrl K` y **Buscar documentos** recorren `normas` en secuencia en cada búsqueda (`unaccent(nombre) ILIKE` sin índice); con cientos de normas conviene un índice de trigramas.
  - La apertura de la revisión anual puede cruzarse con una publicación que confirma en ese instante: la fila de la foto queda con la versión anterior o el documento nuevo fuera de la foto (F-M2: entre el `INSERT` de la revisión y la foto, un acto concurrente no ve la fila; ventana de milisegundos; un `pg_advisory_xact_lock` compartido entre `abrirRevision` y `revisionAbiertaBloqueada` lo cerraría).
  - La revisión de vencimientos recalcula la vigencia de todos los internos vigentes sin marca cada diez minutos (el test de la campaña vencida necesita 30 s por eso; su filtro de candidatos casi no acota, F-I3); por el Ruling 68 no se rediseñó: medir con los documentos reales.
- **Ya decidido (Ruling 43, F13C-R21 y R25):**
  - `asegurarInforme` repite a propósito el algoritmo de `asegurarActa` (unas 55 líneas, con comentario cruzado); una factorización a `asegurarPdfCongelado` iría con los tests de huella del acta y del informe como red.
  - El informe no imprime el detalle de las cifras «Ratificados» y «Revisados recientemente» (la ventana vive en `revisiones_anuales.ventana_meses`).
  - Verificar un externo desde la tabla de la campaña no resuelve su impacto normativo pendiente.
- **Semáforo, ratificación y ficha:**
  - La ficha del portal decide el bloque «Documento externo» por `version.origenAprobacion === "externo"` y no por `documentos.origen` (`src/app/(app)/documentos/[codigo]/page.tsx:283`), contra F13C-DC8 («el origen manda»).
  - Tras ratificar, «Ratificar sin cambios» sigue disponible el mismo día (el spec no lo limita).
  - El enlace al trámite del bloque de vigencia (`verTramite`) es más estricto que `puedeVerTramite`: un líder de otro proceso que podría abrir el trámite ve solo su número.
  - `resumenVigenciaDeProceso` cuenta por proceso propietario (con subprocesos inactivos y sin «También aplica aquí»): el resumen del encabezado del proceso puede no coincidir con la lista visible.
  - `TablaSemaforo` monta `DialogoRatificar` dos veces por fila (en la tabla y en la tarjeta del celular).
  - `PaginaSemaforo` llama `alcanceProcesos` tres veces y `obtenerConfigDocumental` dos; `columnasDeVigencia` relee la configuración en cada llamada.
  - Capas: `filtro-semaforo.ts` y `semaforo-excel.ts` importan tipos de `@/db/consultas`; `rutaSolicitarCambio` vive en un componente; dos helpers del texto de la última revisión (`textoUltima` y `textoUltimaRevision`); la clase `FOCO` repetida; el rótulo «ed. X»/«vN» duplicado entre `rotuloVersion` y el Excel.
  - W4 (cosmético): en la ficha, «Ratificar sin cambios» ocupa su línea y «Solicitar cambio» con la leyenda «En revisión anual» pasan a la siguiente (depende del ancho medido en el navegador).
- **Externos:**
  - El selector de responsable técnico lista todos los usuarios activos.
  - La «norma enlazada» de un externo es la primera fila de `norma_documentos`; cambiarla borra esa fila aunque la haya creado el normograma.
  - El panel (`editarControl`) deja cambiar el código y el título de un externo sin auditoría `externo_*` (solo Admin SGC; el tipo sí está protegido); `exigirTipoDeInterno` reconoce el tipo solo por la sigla `DE`.
  - `fichaDeExterno` es la tercera copia del `LATERAL` de «última verificación».
  - `escaparLike` existe en tres sitios y `documentoDeVersion` duplica `admin.ts` con otra nulabilidad.
  - `jefesDe` se llama una vez por externo dentro del bucle de escalamiento.
  - Adoptar sobre una fila pendiente de la revisión deja `antes: null` en la bitácora (la versión anterior se deduce de `externo_adoptado`).
  - F-M5: un externo registrado y nunca adoptado no da tarea ni aviso (sin vigente no entra al semáforo); solo la matriz lo muestra «Atención · sin edición adoptada». Una tarea «Adoptar la primera edición de …» para quien lo gestiona cerraría el hueco.
  - F-M6: el tipo «Documento externo» se reconoce por la sigla `DE` (`origen.ts`, `registro.ts`): si el Admin SGC la edita en Tipos de documento, `registrarExterno` falla con «Falta el tipo» y `exigirTipoDeInterno` deja de rechazar. Proteger la sigla de ese tipo (o marcarlo con una columna) y decirlo en el manual.
- **Revisión anual e informe:**
  - F-M3: un documento que cambia de proceso propietario con la campaña abierta se queda sin sección (los procesos salen de la foto y los documentos se agrupan por el propietario de hoy) hasta que `recontarProcesos` lo asienta al cierre, ya «sin revisar»; un `alCambiarPropietario` que asegure la fila del proceso lo resuelve.
  - `vigencia/revision-anual/[id]/page.tsx` pasa `abierta: false` con la revisión abierta para apagar los botones e importa `lineaDeRevision` de `PanelAdmin.tsx`.
  - `alcanceProcesos` corre dos veces por página de la revisión y `anioDeRevisionCerrada` dos veces por PDF.
  - El panel de toda la entidad se decide con `alcance.todos` (verdadero también para Consulta, que la guarda de la página deja fuera).
  - `informeRegistrado` supone una sola evidencia por revisión, y `asegurarInforme` deja un archivo huérfano inofensivo si falla el `INSERT` (como el acta).
  - El informe reconoce un externo por traer `edicion` (uno sin edición saldría «v<n>»; ningún camino validado lo produce).
  - `revisionAnualId` viaja también si la persona cambia a otro documento en la solicitud (la decisión se registra igual por `alSolicitar`).
  - «Marcar cambios…» exige JavaScript (antes era un `details`).
  - En la tabla de la revisión por proceso, un chip de vigencia largo («Atención · edición nueva pendiente de adoptar») estrecha la columna «Documento» a 1280 px (la decisión queda a la vista por la columna fija de W3; con «Al día» la tabla cabe entera).
  - `src/lib/vigencia/decisiones.ts` no es puro por sus importaciones; `responsablesDelProceso` vive en `vencidos.ts` y lo importa `campana.ts`; el ciclo `admin.ts` ↔ `registro.ts` es benigno.
  - `sacarDeLaRevisionAbierta` fuera de una transacción revertida deja una fila `revision_anual_decision` con usuario nulo (permitido).
- **Normograma:**
  - El selector «Norma enlazada» del alta y la edición de un externo lista todas las normas, también las derogadas y las retiradas, y el dominio tampoco lo rechaza (`registrarExterno` y `editarControlExterno` solo comprueban que la norma exista, `nombreDeNorma`); en la ficha de una derogada sigue «Enlazar documento» (un documento enlazado a una derogada ya no recibe impactos, solo el retiro). W2 solo quitó las derogadas de «Asociar norma» y de «Asociar proceso».
  - No existe una lista de impactos pendientes: cada impacto se atiende desde `/normograma/impactos/[cambioId]?proceso=`.
  - El 409 de la subida del PDF a una norma retirada (F-M7) se comprueba antes de la transacción y no se repite bajo el candado de `registrarArchivo`: un retiro que confirme mientras dura la subida deja el PDF en la norma retirada.
  - `cambiarEstadoNorma` tipa el estado como `EstadoNorma` (solo el chequeo en ejecución rechaza `retirada`); `CONTEXTOS_UNICOS` es una búsqueda sobre un objeto plano.
  - `src/lib/normograma/tipos.ts` reimplementa `acotado`, `opcionalAcotado` y la validación de fecha de `vigencia/externos/comun.ts`; `concat_ws` del nombre de la norma sigue repetido aunque existe `nombreSql`.
- **Indicadores:**
  - F-M4: los Excel de vigencia (semáforo, externos, indicadores) responden 404 sin permiso y los de la 13B 403; `AGENTS.md` fija 403 salvo el GET de un archivo. Unificar o escribir la excepción.
  - La página corre `alcanceProcesos` cuatro veces (cinco en el Excel) y `obtenerConfigDocumental` tres; `condicionTramites` es una regla de alcance que vive en `indicadores.ts` y no en `src/lib/alcance.ts`.
  - El selector de periodo ofrece solo el año en curso y el anterior (uno más viejo entra por la dirección).
  - El indicador de acuses hereda de `resumenAcuses` que las versiones no vigentes solo cuentan para quien tiene `documentos.ver_historial` (Gerencia y el Admin SGC pueden ver cifras distintas del mismo periodo).
  - `textoPorcentaje` supone que la cifra y el veredicto de la 13B salen de la misma razón (hoy es así).
  - «Días vencido» como cabecera del Excel; los Excel de la fase no usan el mismo formato de fecha (Maestro, normograma e indicadores `aaaa-mm-dd`; semáforo y externos «14 ago 2026»).
  - Las pestañas de Vigencia pasan a dos renglones a 390 px con la cuarta pestaña.
- **Tareas, avisos y cascarón:**
  - El grupo «N externos por verificar» lleva a la matriz, que muestra más que los agrupados.
  - El título del grupo de vigencia clasifica «vencido» por instante y el Semáforo por días (en el borde, el enlace cae al lado seguro, sin filtro).
  - El número del aviso agrupado de vencidos es el de los avisados en esa pasada (una pasada posterior puede decir «1 documento» con ocho vencidos).
  - La insignia de **Vigencia** no cuenta un externo fuera del alcance de quien tiene `vigencia.ver` y es su responsable técnico.
  - Si la lectura compartida de la vigencia falla, las tareas de vigencia y la insignia desaparecen sin aviso al usuario (queda en el registro y la página pinta).
  - La respuesta en caché de `esResponsableTecnicoDePeticion` comparte también su rechazo: el cascarón lo captura (`tareasDePeticion`), pero `exigirVigencia` no, así que un fallo pasajero de esa consulta en el cascarón tumba también la página de Vigencia de esa petición (antes eran dos consultas).
  - Las tareas de vigencia salen en el orden adoptar, verificar, revisar (nadie lo pidió).
  - `esResponsableTecnico` sigue siendo una consulta por petición para todo usuario, y «Mis tareas» corre la lectura de vigencia una vez por petición para Admin SGC y líderes (desde la corrección final la comparten el cascarón y la página con `React.cache`, y Gerencia y Control Interno solo cuentan la insignia; Ruling 68).
  - F-M1: `procesosDeLaPersona` (`revision-anual/comun.ts`), `dePersona` y la marca de proceso sin líder (`normograma/impactos.ts`) y `proceso_con_lider` (`fragmentos.ts`) reescriben en SQL «líder → sus procesos activos» y «Admin SGC → procesos sin líder», contra la letra de la regla de `alcanceProcesos()` de `AGENTS.md`: moverlos a `alcance.ts` o matizar la regla.
  - F-M9: `exigirVigencia` pregunta `esResponsableTecnico` aunque la persona tenga `vigencia.ver` (desde la corrección final la respuesta es la del cascarón en la misma petición, `esResponsableTecnicoDePeticion`; cortocircuitar con el permiso la quitaría también fuera de un render).
  - El SQL de «proceso sin líder» de `src/db/consultas/vigencia/tareas.ts` duplica la regla de `lideresDeProceso`.
- **Lo heredado de la 13B (distribución):**
  - Las fotos de una corrección rechazada siguen bajo la corrección siguiente.
  - El título del aviso de reapertura lleva la nota entera, y la página del hallazgo no muestra el motivo de la reapertura (va en el aviso y en la bitácora).
  - El Excel de socializaciones no tiene tope: multiplica consultas por jornada y carga evidencias que no usa.
  - Al líder le aparecen puntos ajenos donde solo tuvo copias ya retiradas, con todo en cero.
  - Tras un cierre rechazado por el servidor, las respuestas de la lista de chequeo se ven en blanco hasta recargar (heredado de la 13B).
  - El enlace de la foto de la corrección no dice formato ni tamaño.
  - `comoSeCerro` distingue la validación del cierre directo comparando notas.
- **Configuración documental y textos:**
  - `campoMeta` arma los nombres de campo por convención en `FormularioConfigDocumental`, y el bloque de márgenes del informe repite el del acta en `config-documental.ts`.
  - `src/lib/esquemas/mapa.ts` redefine un `texto` local idéntico al de `src/app/admin/comun.ts`.
  - Una línea corta por el reflujo del párrafo de `archivos` en `AGENTS.md` (cosmético).
- **Esquema y datos:**
  - `NULLS NOT DISTINCT` de `lista_miembros_unico_idx` está solo en el SQL, no en `esquema.ts` ni en el snapshot (el test lo detecta si se pierde).
  - Tres nombres de FK de más de 63 caracteres: Postgres los trunca y la migración imprime tres NOTICE 42622.
  - `MS_DIA` redeclarado en `plazo.ts` y `definiciones.ts`; `sumarMeses` con meses negativos daría un mes inválido (nadie lo llama así).
- **Pruebas:**
  - El test de la clave errada crea un `admin_sgc` activo y lo desactiva en `finally` (si la corrida muere en medio, queda activo).
  - Sin test del 429 de las rutas de externos.
  - `CHECK` sin test: estados y resolución de impactos, meses de externos, `metodo_cierre`, únicos de `norma_procesos` y `norma_documentos`, número de norma sin distinguir mayúsculas.
  - El test «la 0010 se puede volver a correr» solo mira el texto del SQL, y la aserción `/ FOR SHARE;/g` depende del texto literal de la función.
  - Un externo ignora `ultimaRatificacion` sin test que lo fije.
  - La parte «sin revisión abierta» del test de la prórroga no puede fallar; el filtro `normograma.porProceso` no se ejercita; `porDecidir: true` no se afirma en una fila «sin revisar» simple; `propuesto` (el año que propone abrir) no prueba el año anterior.
  - `tests/revision-anual-externos-insumos.test.ts` usa `lider.cex` y `lider.gth` de la demo; el test «no ofrece externos» escribe "DE" a mano y depende de que haya internos vigentes.
  - Ningún test prueba los acuses con proceso elegido ni el valor exacto «desde la solicitud» del tiempo de aprobación.
  - El test de frases de la bitácora recorre por texto y las plantillas van a mano.
  - El test de la frontera cliente/servidor no ve constantes en mayúsculas, comentarios antes de `"use client"` ni `import X, { a }`.
  - `sembradaEn` se toma unos segundos antes de las filas que la siembra inserta con `now()`.
  - «Worker exited unexpectedly» de Vitest en algunas primeras corridas, sin tests fallidos (la intermitencia de la Fase 11).

**De la Fase 13B** (todos menores, aceptados en la revisión de cada tarea o aplazados en la ola final, salvo el
primero; los marcados «resuelto en la 13C» ya no son deuda):

- **Resuelto en la 13C:** el Excel de socializaciones (`/distribucion/socializaciones/excel`, acción `exporto_socializaciones`).
  Sigue abierto: `acuses-excel.ts` no se migró a `hoja-excel.ts` (tercer constructor).
- **Aplazado en la ola final:**
  - Reemplazo individual desde el diálogo de emisión (spec §8.5): `reemplazaCopiaId` existe en la acción, sin interfaz.
  - Resuelto en la 13C: la fecha de corrección se elige al cerrar la verificación (F13C-R36).
  - «Verificaciones en que apareció» en la página de la copia y la vista por documento (spec §8.6).
  - El modo del acuse (individual, por asistencia, por firma) no se muestra en «Mis lecturas» (spec §10.3).
  - Resuelto en la 13C: Gerencia, Control Interno y los líderes leen el catálogo de puntos y listas en solo lectura
    (F13C-DC30, DC32).
  - El vencimiento de las verificaciones se mide en milisegundos (`verificacionCadaDias × 86 400 000`) y no con
    `fechaLimite` y la zona de la instalación: cambiarlo mueve el borde un día y `tests/distribucion-reglas.test.ts` lo fija.
  - La semilla mínima no escribe las claves de distribución (las cubren los valores por defecto del código).
  - Reimprimir no sugiere «anule y emita otra» (spec §8.5).
  - Cobertura: la matriz de visibilidad de §17 por pestaña y rol, `a11y-estructura` en las páginas nuevas y el guard del test
    de hallazgos en `semilla-distribucion`.
  - Pasar un documento a restringido con copias vivas en puntos cuyo responsable no lo ve no se bloquea ni se avisa.
  - Rendimiento: `misTareas` consulta seis fuentes en cada render y lee fotos de hallazgos que no usa; los acuses sin jefe se
    revisan en cada pasada.
  - Resuelto en la 13C: el aviso «Se emitieron N copias» de **Reemplazar** ya se ve.
  - Resuelto en la 13C: los conteos de `/distribucion/copias` del líder incluyen las copias que emitió en puntos de otros
    procesos.
  - Al salir de un proceso, el acuse pendiente de un restringido queda oculto (tareas y `/acuses/[id]`) pero no retirado; solo
    el cambio de rol lo retira (`soloSinAcceso`).
  - `acusesDeIngreso` no recibe `actorId`: un Admin SGC que se añade un proceso a sí mismo se avisa a sí mismo.
  - Menores de las tareas sin línea propia: sin test de inmutabilidad de `acuse_eventos` con el dueño del esquema ni del
    estado `descartada`; `copias/[id]` y el detalle de una jornada sin `exigirDistribucion` explícito (la consulta da 404);
    `CLASE_DIALOGO` repetida en `AccionesCopia` y `DialogoEmitir`; la recogida automática no audita (ruling de la Tarea 6);
    `corregirMarca` no rechaza trámites de eliminación en el dominio; `/verificaciones/nueva` redirige a la abierta sin
    comprobar visibilidad (el destino la aplica); casilla del acuse sin `required`.
- **Catálogos:** sin test de `parsearPuntoUso` ni de las acciones; `alternarPuntoUso(true)` no valida procesos activos;
  `editarCatalogo` y `guardarAudiencia` corren en dos transacciones; `guardarAudiencia` no exige listas activas (solo la
  interfaz); el retiro de acuses no cubre cambios de cargo, área o rol de los miembros de una lista; `N+1` de `quienFalta`
  en la página del documento.
- **Sello y copias:** `validarUrlPublica` admite IPv6 y `\`, y faltan casos de test (mayúsculas, `localhost:3000`, credenciales,
  `?`/`#` finales); el mensaje de cm dice «entre 0,5 y 3» sin «3,0» y el `pattern` admite un solo decimal; las heurísticas del
  sello (`HOLGURA_PT`, factores) no usan métricas reales de la fuente y un QR mayor que una franja muy baja sobresale;
  `copiaParaPdf` no reconfirma la vigencia dentro de su transacción final; `anularCopia` no valida el motivo contra
  `MOTIVOS_ANULACION`; `reemplazaCopiaId` no bloquea la copia reemplazada; limitador de ritmo duplicado en las dos rutas
  del PDF; `AccionesCopia` pasa de 280 líneas.
- **Acuses y jornadas:** la conformidad podía mostrar 95 % redondeado con `cumple = false` (resuelto en la 13C: se trunca, F13C-R35); `localeCompare` sin locale en
  `armarListaDeChequeo`; «Porcentaje» como texto en el Excel de acuses; `pedirAcusesAccion` sin mensaje de conteo; los
  motivos de cierre de acuses sin `CHECK`; `unlink` de evidencias traga todo error (solo ENOENT debería); el detalle de
  `aceptar` en la bitácora lleva la clave solo cuando es `true`; anular una jornada reabre la requerida aunque exista otra
  jornada válida; `efectoDeAnular` cuenta solo versiones visibles para quien anula.
- **Verificaciones:** el trigger no bloquea `INSERT` de ítems en una verificación cerrada (lo cubre la aplicación); el `GET`
  de fotos carga toda la verificación para autorizar; `N+1` de `evidenciasDe` en `leerHallazgos`; sin test de
  `cerrarHallazgo` por `distribucion.gestionar`.
- **Vencimientos:** `acusesVencidos` lee `jefesDe` por versión (N+1 dentro de la transacción); los contadores «avisados» y
  «escalados» no tienen JSDoc.
- **Pruebas:** muchas consultas por jornada en `cargarJornadas` y `LIMIT` antes del filtro de visibilidad; sin test de render de
  la página del trámite con el bloque de distribución; `total = tareas.length` por defecto en `MisTareas` oculta un olvido
  del llamador; no se recorrieron en navegador la lectura obligatoria al ingresar, las listas completas ni la recogida
  automática en los tres lugares (los cubren los tests).

**De la Fase 13A:**

- **Botones con `disabled:opacity-*`** (F13A-R30): `estructura/page.tsx`, `FormAccion`,
  `FormularioVersionCliente`, `BotonRestablecer`, formularios de estructura, mapa, usuarios, lote
  y cuenta, y `components/ui/button.tsx`. `AGENTS.md` prohíbe `opacity` para atenuar controles:
  **Fase 19**.
- **Sin prueba de concurrencia real** en aceptación y firma: `revertida` usa una sola transacción.
  Doble clic y dos aceptaciones simultáneas están razonados sobre los candados, no ejercitados.
  Lo mismo el código único bajo aceptaciones simultáneas (spec 13A §19): probarlo de verdad
  confirmaría filas imborrables en `auditoria`, `firmas` y `tramite_eventos`.
- **Un acta perdida tras un cambio del generador queda en 404, sin camino de reemisión.** Los datos
  siguen en `detalle.acta` y en `firmas`, pero la regeneración no coincide con la huella. Falta un
  camino del Administrador del SGC para reemitirla, con su nota y su auditoría.
- **`lideresDeProcesosDelDocumento` excluye procesos inactivos** (la misma regla de
  `lideresDeProceso`): el líder de un proceso desactivado no recibe el aviso de cierre.
- **`dias` no entero da una fecha inválida** en `src/lib/tramites/plazos.ts`: hoy lo valida quien
  llama.
- **La etiqueta `patron_codigo`** sigue en `bitacora-detalle.ts` por los eventos históricos, aunque
  la clave ya no se siembra.
- **Dos reasignaciones en la misma etapa y ronda** no se detectan como pestaña vieja: gana la
  última y las dos quedan en el historial.
- **`misTareas` corre dos veces en `/`** (cascarón y página), hasta cuatro consultas.
- **`src/db/semillas/demo.ts` tiene unas 1150 líneas:** los trámites sembrados se pueden separar.
  Además reimplementa `transicionar`, `publicarVersion` y la auditoría, aunque `transicionar` ya
  acepta `opciones.ahora` y `opciones.verificar`: sus ~300 líneas pueden desviarse. Hoy `paso()` no
  limpia `aviso_vencido_en` ni escribe `motivo_cierre`; no afecta a la demo actual.
- **Relaciones `(A,B)` y `(B,A)` heredadas** no se unen (F13A-R27).
- M12 no se hizo (F13A-R34): recargar a mitad de un formulario pierde lo escrito sin avisar.
- Al firmar con una cuenta ya bloqueada o inactiva, la sesión se cierra y `/ingreso` no dice por
  qué: el mensaje fijo solo sale cuando ese intento bloquea la cuenta.
- **Actas ya emitidas:** R33, la redacción de observaciones y quitar los códigos de los parecidos
  (F13A-R38) cambian los bytes del PDF. Si en una
  instalación real se pierde un acta generada antes de esos cambios, no se regenera idéntica y
  queda `acta_no_regenerable` en la bitácora.
- Sin aviso a los líderes del proceso nuevo si el propietario cambia al aceptar o al corregir
  (F13A-R7, R23). Carrera posible en `codigoAbandonado` (F13A-R23).
- La huella que muestra el diálogo de firma puede ser vieja con dos pestañas; la firma guarda la
  actual. `candidatosDe` ofrece a quien ya firmó `elaboro` y el servidor lo rechaza con mensaje.
- Devolver con marcas sin guardar las pierde. `bloquearComo` usa las
  reglas de devolver y enviar como sustituto de persona y etapa.
- **De la adición del acta con formato** (todos menores, aceptados en la revisión de cada tarea):
  - «Concepto de» puede salir sola en otra hoja en casos estrechos: la reserva queda 4 puntos
    corta. El arreglo es sumar 4 a la reserva de `Hoja.criterio` en `src/lib/acta.ts` y un test
    de barrido.
  - Sin bloqueo al guardar la configuración (heredado): con dos sesiones simultáneas la bitácora
    puede omitir un cambio. `config-documental` arrastra `pdf-lib` a sus importadores. La coma en
    `type=number` solo se probó en Chromium.
  - El 404 de un trámite oculto cuesta más consultas que el de uno inexistente (tiempo, sin fuga);
    `obtenerTramite` carga todos los eventos para un booleano; sin test del bloque del acta en la
    página del trámite.
  - Sin test de posiciones contra los márgenes; faltan bytes vacíos y PDF sin páginas en el test del
    motivo; una página con `/Rotate` se juzga por su `MediaBox`.
  - `criterios` no excluye ítems vueltos críticos (inocuo: el diálogo no se monta); el aviso de la
    nota no es región viva; hay dos `role=group` con el mismo nombre en el diálogo.
  - `acta_no_regenerable` apunta a dos entidades distintas según el motivo; falta cubrir con test
    un `archivoId` inexistente y la regeneración con el formato obsoleto.
- Un `consulta` designado elaborador puede subir `.zip` y `.rar` (lista blanca heredada; no son
  ejecutables). Un `%` inválido en `x-nombre-archivo` da 500 e `includes("principal")` sigue en el
  `catch` de `recepcion-archivo.ts` (heredados). `descartarResto` no tiene tiempo límite propio
  (lo cubre el `requestTimeout` de Node) y el 413 sin `content-length` no drena.
- El respaldo sin JavaScript de un formulario cliente es débil: `action` espera a la hidratación
  (heredado). Estadísticas enlaza a 404 un documento sin vigente (heredado).
- El filtro «Entidad» de la Bitácora sigue técnico. Descartar usa `documentos.administrar` y el
  spec dice `tramites.gestionar` (hoy el mismo rol). La rama de historial de la ruta de archivos
  del panel es por exclusión.
- `PanelPublicacion` repite el tipo de `PanelAprobacion`; `publicarVersion` existe en `cierre.ts` y
  en `admin.ts`. `tramites.documento_id` no tiene índice propio. `diaLocal` creaba un
  `Intl.DateTimeFormat` por llamada (resuelto en la 14A, F14A-R29). Un `patron_codigo` vacío compila a `RegExp("")` y acepta todo
  (heredado). `firmas.ts` con un `usuarioId` inexistente da `TypeError` (falla cerrado).
- Cobertura: `esquema-fase13a` y privilegios dependen de una base sembrada; sin test de que
  `maestro.ver`, `maestro.exportar`, `estadisticas.ver` y `bitacora.ver` sean subconjunto de
  `ROLES_VEN_RESTRINGIDO`; sin casos con ids nulos en las reglas de cancelar, reasignar y publicar;
  sin `estadoPlazo` cerca de la medianoche; firma sin el secreto ilegible por `verificarParaFirmar`
  ni `bloqueos_consecutivos`; sin subida frente a cancelación; sin regeneración del acta tras un
  fallo real en navegador. Un test de candado confirma una fila y la borra en `finally`, y el del
  envoltorio de configuración escribe las diez claves en `finally`. `tests/mapa-admin` depende de
  que no exista la fila `patron_codigo`. Sin `SEMILLA_RECIEN`, una base recién sembrada salta casos
  en vez de fallar; `sembradaEn` no controla si falta `gerente`, y `exigirDemoIntacta` fija 30
  documentos. Tres aserciones quedaron más flojas a propósito por el uso de la demo (`esquema:148`,
  `visibilidad:200`, `consultas-fase4:105`).

**De la Fase 12:**

- **Renombrar los alias `azul`/`verde`** (`bg-azul`, `text-azul-tinta`, `text-verde`,
  `text-verde-texto`, `bg-verde/15` de `TextoResaltado`…) a los nombres de token y
  retirarlos de `@theme inline`: **Fase 19** (F12-DC10, F12-D34).
- **Piso de navegadores:** `light-dark()` exige Chrome ≥ 123, Safari ≥ 17.5 y
  Firefox ≥ 120 (Edge sigue a Chrome); en uno más viejo los colores no cargan. Va como
  requisito en la guía de instalación de la **Fase 20**.
- **`Boton` y `Campo` en los formularios heredados**: siguen con su marcado y clases
  propias (F12-DC18); las clases de peligro de `FormAccion`, `BotonRestablecer` y
  `BotonBorrar` repiten a mano `claseBoton("peligro")`: **Fase 19**.
- **Favicon desde el logo:** sigue el estático de la plataforma (spec §7.2): **Fase 19**.
- Páginas del portal (Inicio, proceso, subproceso, ficha de documento) sin `<title>`
  propio: la pestaña dice «<nombre> · SGC» en todas (heredado de `sgc-suaza`).
- Un `notFound()` bajo una ruta con `loading.tsx` responde 200 en vez de 404 (el
  streaming ya envió la cabecera); la página sí es «Página no encontrada» (heredado). Afecta a
  toda página de `(app)`, también a `/tramites/[id]`: ver F13A-R35.
- `/marca/logo` sin limitador ni `immutable`: el limitador cubre solo el `POST` del logo y
  la respuesta lleva `Cache-Control: public, max-age=86400` aunque la URL cambia con
  `logo_version`.
- Un archivo huérfano en la primera subida concurrente del logo: en dos primeras subidas
  simultáneas (`FOR UPDATE` sin fila), o si `guardarLogo` falla entre `writeFile` y la BD,
  queda un `logo-<hex>` sin referencia en `almacen/marca`.
- Un PNG políglota (firma PNG válida con otro contenido, p. ej. SVG) llega a disco y se
  sirve como `image/png` con `nosniff`.
- `Content-Length "1e3"` pasa `Number.isInteger` en el `POST` del logo (el tope real se
  revalida en `validarLogo`).
- Opacidad de los nodos inactivos en la vista previa del mapa (`Banda`,
  `RailPeriferico`, `TarjetaProceso`) sin medir contra AA.
- Doble espacio bajo `EncabezadoPagina` en algunas páginas (mapa, periféricos, lote,
  ficha del panel): su `mb-6` se suma al `gap` del contenedor. Los `h1` del portal bajaron
  a 2xl seminegrita con el componente (antes eran más grandes).
- **Lema:** con el lema vacío, la franja del pie del mapa se pinta vacía (solo el ícono),
  y si falta la clave `MapaProcesos` cae a un lema fijo de la demo («Comprometidos con la
  vida…») que el test de textos fijos no cubre. Ocultar la franja sin lema.
- `?guardado=1` persiste en la URL: «Cambios guardados» sigue a la vista en la pantalla
  Entidad y marca mientras la URL lo tenga.
- El error del servidor de la pantalla Entidad sale bajo el formulario y no junto al
  campo (§7.3; el aviso en vivo sí va junto al color).
- Pantalla de entidad: un `useState` con `valor()` muerto; sangría irregular en
  `EntradaColor` y línea en blanco doble en `CargaLogo`.
- Duplicados de usuario: el mensaje pide renombrar cuando la app no arranca, lo que solo
  se puede con `psql` (guía de la **Fase 20**); `db:migrate` y el arranque muestran el
  `NOTICE` de Postgres de `__drizzle_migrations`.
- Búsqueda `Ctrl K`: una consulta que falló no se reintenta mientras no cambie el texto.
- `Boton` sobrescribe un `aria-busy` del llamador; `Dialogo` no limpia al desmontar y un
  clic en su propio relleno lo cierra (el relleno va en un hijo).
- Fecha futura de una notificación → «ahora»; `FOCO` repetido en varios componentes del
  cascarón.
- Íconos decorativos con `text-white` sobre el color de la banda o del macroproceso sin
  oscurecer (`admin/mapa/page.tsx` y los heredados de la Fase 9; `aria-hidden`).
- `--chart-3` oscuro coincide con `--texto-terciario` oscuro (`#8b94a3`).
- Textos vacíos genéricos de `TablaDatos` («Sin documentos» perdió la ayuda «Cree el
  primero…»; «Sin registros en el periodo» en Accesos también con filtros de usuario).
- Estadísticas perdió su animación de entrada.
- **F12-D35 se revisa en la 13B:** marcar una notificación como leída no se audita;
  cuando «marcar leída» pase a ser el acuse de una tarea (acuses de lectura), esa acción sí
  es evidencia y debe quedar en la bitácora.
- Cobertura: sin tests de `EstadoVacio`, `Insignia` de módulo, `TarjetaCifra` sin estado
  ni `Campo` sin ayuda o error; sin test de 429 ni de `q` con `⟦⟧` en `/api/buscar` (sus
  casos dependen de documentos de la demo con «acta»); sin test de
  `marcarNotificacionLeidaAccion` ni de `marcarTodasLeidas` con filas ajenas (lo cubre la
  consulta); `fechaCorta` de `MisTareas` sin test y el caso de zona depende de que
  `ZONA_HORARIA` falte o sea Bogotá; el test de `obtenerMarca` corre sobre la demo
  completa (no prueba la caída por clave ausente ni por color inválido); la comprobación
  de la semilla mínima no tiene test propio; `tests/esquema.test.ts` (rol por defecto,
  correo único) limpia con `DELETE` después del `expect` y deja filas `zz_*` si falla;
  `tests/proxy-redirecciones.test.ts` repite un caso de `tests/guardia.test.ts`.
- El emisor del TOTP cae a «Entidad sin configurar» sin nombre de entidad; `Math.abs` sin
  efecto en la rama gamma de `color.ts`.
- Los usuarios `zz_*` y `admin_pub_*` de los tests aparecen en la lista de usuarios de la
  base de desarrollo (F11-D2; `db:seed` los limpia).
- Un fallo intermitente de la suite se vio una vez en la Fase 12 (1479/1481) y no se
  reprodujo: ver la entrada "Fallo intermitente" de la Fase 11, ampliada.

**De la Fase 11:**

- `scripts/carga.ts` (prueba de carga de la Fase 10) recorre rutas sin sesión y ya no
  sirve tal cual: se adapta en la **Fase 19**.
- **Los tests de BD no corren en CI** (hoy casi todos: esquema, sesión, ingreso,
  usuarios, estructura, privilegios, publicar…). Falta un job con Postgres de servicio,
  migraciones, `db:roles` y semilla demo.
- `npm audit --omit=dev`: 0 críticas, **3 altas transitivas aceptadas** (F11-D25):
  `brace-expansion` vía `exceljs` → `archiver` → `glob` → `minimatch`; `nanoid` y
  `source-map-js` vía `next` → `postcss` (de build). Más 10 moderadas. Ninguna se
  alcanza con entrada del usuario; la **Fase 19** revisa dependencias y fija el umbral
  del audit en CI.
- **Fallo intermitente en la primera corrida** de la suite tras editar código: visto dos
  veces (un archivo entero en rojo, unos 14 tests) y no reproducido en las corridas
  siguientes. Sospecha: arranque en frío + Argon2 en `beforeAll` con el timeout por
  defecto. Si reaparece, capturar la salida y revisar timeouts de esos `beforeAll`. En
  la Fase 12 se vio una vez otra forma (1479/1481 con un error, sin capturar ni
  diagnosticar, tras la ronda de arreglos de la Tarea 15); no se reprodujo en las cuatro
  corridas siguientes ni en la del cierre.
- `tokens_un_uso` (activación y restablecimiento por enlace) pospuesta a la **Fase 16**
  (F11-D7).
- Archivos de despliegue heredados: `docker-compose.nas.yml` y `.env.nas.example` solo
  tienen lo mínimo de la Fase 11 (la app conecta como dueño, no como `sgc_app`) e
  `INSTALACION*.md` no describe las variables nuevas; el compose de desarrollo y el
  `Dockerfile` aún mencionan el NAS/ARM64 en comentarios. Los reemplaza la **Fase 20**.
- `next build` avisa que `src/lib/almacen.ts` (`path.resolve(process.env.ALMACEN_RUTA …)`)
  hace trazar todo el proyecto en `.next/standalone` (heredado de la Fase 4; la imagen
  no copia `.env*` por `.dockerignore`). Acotar la ruta en la Fase 19. Desde la ola final
  de la Fase 12, `.dockerignore` excluye `almacen`, `respaldos`, `.superpowers`,
  `.playwright-mcp` y `coverage`, y la imagen crea `/app/almacen` vacío y del usuario
  `nextjs`. El compose de desarrollo sigue sin montar un volumen de almacén: lo que se
  sube en 9081 vive dentro del contenedor y los documentos de la demo no tienen archivo
  allí. El volumen nombrado llega en la **Fase 20**.
- **Rotar `APP_SECRETO` invalida los secretos TOTP:** quien tiene segundo factor ya no
  puede validar el código de su aplicación (cada intento cuenta como fallo y termina
  bloqueando la cuenta). Entra con un código de recuperación, o el administrador le quita
  el segundo factor y lo vuelve a activar. Va al **manual técnico de la Fase 20**, junto
  con la generación de `APP_SECRETO` al instalar.
- Menores diferidos de las revisiones (para F12/F19 o al tocar el archivo):
  - Los mensajes genéricos de `zod` (ids, enums, fechas) siguen mostrando el nombre interno del
    campo delante; los de texto ya dan un mensaje propio desde la 13A.
  - Tras activar el segundo factor, el foco no se mueve al título de los códigos de
    recuperación.
  - `cerrarSesionAccion` lanza (pantalla de error de Next) al superar el límite de ritmo.
  - Cierre forzado + acceso + auditoría no van en una transacción; en el lote, si falla
    la auditoría final, las cuentas existen pero se pierden las claves temporales.
  - `alternar_*`/`reordenar_area` auditan sin el nombre del área o cargo.
  - En el lote, un cargo cuyo nombre solo choca con otro casi igual de la misma área
    responde "existe en varias áreas" cuando se escribe sin área; con `Área > Cargo` el
    mensaje es el correcto.
  - Un bloqueo causado por fallos del segundo factor queda como `factor_fallo`, sin fila
    `bloqueo` en accesos.
  - Sin `CONFIAR_PROXY`, un cliente puede agotar el balde compartido de ingreso (120/min):
    documentar `CONFIAR_PROXY=1` en la guía de la Fase 20.
  - Los códigos de recuperación se guardan como SHA-256 sin sal (pasar a HMAC con clave
    derivada de `APP_SECRETO`); `totp.ts` importa la lista de claves (767 KB) solo por el
    alfabeto.
  - El servidor acepta cargo, procesos o jefe inactivos ya existentes al crear o editar
    (solo la interfaz los filtra); `crearCargo` no comprueba que el área esté activa.
  - El contador de sesiones activas del detalle de usuario cuenta sesiones vencidas por
    inactividad.
  - Un lote de 500 filas tarda decenas de segundos (Argon2 en serie) sin indicador de
    progreso.
  - `texto_phva` vacío en la semilla demo (la original traía el texto del PHVA).
  - Cobertura: `mutacion` sin test de comportamiento; las regex de los tests
    estructurales son laxas; las acciones de TOTP sin tests a nivel de acción.
  - `ALTER ROLE sgc_app` no fija `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
    NOBYPASSRLS`; en el modo heredado la app corre como dueño solo con un aviso.

**Heredada:**

- El artefacto `.tar.gz` del CI aún no se ha probado con `docker load` en un NAS real.
- Retirar `ADMIN_CLAVE` del entorno del contenedor tras el primer arranque (queda en el
  entorno); la guía de instalación de la Fase 20 debe decirlo.
- El route handler de archivos lee el archivo completo vía stream pero sin soporte de
  `Range`; irrelevante a esta escala, revisar solo si los PDF reales resultan enormes.
