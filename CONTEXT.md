# CONTEXT.md — Estado vivo del proyecto

> Se actualiza al cierre de cada fase. Última actualización: **2026-11-06**. La **Fase 13A —
> Flujo documental** está hecha en la rama `fase-13a-flujo-documental` (64 commits de ejecución
> y este de cierre) y espera la revisión final de la rama, la prueba del usuario y la fusión. La
> Fase 12 (nueva estructura visual) y la Fase 11 (fundación de acceso) están en `main`.
> La variante nació el 2026-11-03, bifurcada de `sgc-suaza` en `9644ceb`; el diseño
> maestro de las fases 11–20
> (`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md`) está aprobado
> y `AGENTS.md` describe el piso de despliegue nuevo.

## ⏸ Punto de reanudación (próxima sesión)

0. **Qué es este proyecto:** SGC Integral es la variante ampliada de SGC Documental
   (`sgc-suaza`). El usuario decidió el 2026-11-03 dejar la app original tal como está,
   con sus funcionalidades, y construir aquí otra con **funcionalidades más completas**.
   La original vive en `F:\sgc` (repo `juanfyru/sgc-suaza`) y **no se toca desde este
   proyecto**.
1. **Dónde quedamos:** la **Fase 13A está hecha** en la rama `fase-13a-flujo-documental` (sale de
   `main` en `b94032e`). Un documento nuevo, un cambio o una eliminación recorren ahora un trámite
   dentro del sistema: solicitud con visto bueno, aceptación con duplicidad asistida, código
   correlativo y plantilla, elaboración, revisión con lista de verificación y observaciones,
   aprobación por autoridad, publicación y acta en PDF, con firma por clave en cuatro momentos.
   Además: visibilidad por rol, nivel de acceso y participación; tareas, avisos y vencimientos;
   carga de lo ya aprobado; marca de agua con el nombre de quien descarga. **Sin dependencias npm
   nuevas.** Detalle en «Hecho (Fase 13A)». **Verificado al cierre:** lint limpio; **2805/2805 tests** (118 archivos,
   con `SEMILLA_RECIEN=1`; línea base de la fase: 1662 en 85); build de producción sin URL de base,
   como el CI; compose de desarrollo reconstruido (`up -d --build --no-deps app`, sin tocar `bd`):
   «Migraciones al día» con las cinco migraciones, `/api/salud` 200 `{"estado":"ok"}`, `/` → 307 a
   `/ingreso`. La 0004 se aplicó además sobre una copia con el esquema y la demo de `main`. Hubo tres
   puntos de control en navegador; el tercero recorrió los pasos 1 a 12 de §20, y sus arreglos
   están en los últimos 15 commits. El CI todavía no ha corrido sobre esta rama: no se ha publicado.
   **Falta:** la revisión final de la rama, su ola de arreglos, la prueba del usuario («Qué probar
   y cómo (Fase 13A)») y la fusión en `main`. El usuario decide F13A-R35 (404 real en páginas).
2. **Lo que sigue: Fase 13B — Distribución y puntos de uso** (pasos 9 y 10 del procedimiento del
   hospital): listas de distribución y acuse de lectura con porcentaje, evidencia de capacitación,
   copias controladas con sello, recibido y recogida de las obsoletas, puntos de uso y su
   verificación con porcentaje de conformidad. Sigue el mismo camino de la 13A: spec aprobado,
   plan, ejecución, prueba y fusión; el reparto está en el spec de la 13A, §5. Enganches que deja la
   13A: el **evento de publicación y el de eliminación** (`src/db/consultas/flujo/cierre.ts`), donde
   la 13B cuelga la distribución y el aviso a las listas; `archivos` sin generalizar, porque el
   primer dueño distinto de una versión es la evidencia de capacitación; **marcar leída una
   notificación** no se audita (F12-D35) y, si pasa a ser acuse de una tarea, sí debe quedar en la
   bitácora; el motivo «revisión anual» de la solicitud lo usa la 13C. Insumos que dependen del
   usuario: spec maestro §11 (SMTP, versión de Windows del servidor, planta de cargos real,
   plantilla del plan de mejoramiento, total de cuentas), la lista de verificación real
   (SGC-FO-03) y el ajuste del texto de su procedimiento (el listado maestro aparece con dos
   códigos y la «carpeta oficial» pasa a ser la plataforma).
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
   → **`npm run admin:asegurar`** (crea `admin` / `cambiar-esta-clave`) → `npm run dev`
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
   | `coordinadora.sgc` | admin_sgc | Líder de Calidad | — |
   | `gerente` | gerencia | Gerente | — |
   | `control.interno` | control_interno | Jefe de Control Interno | — |
   | `lider.gth` | lider_proceso | Coordinadora de Talento Humano | GTH |
   | `lider.cex` | lider_proceso | Médico Coordinador | CEX |
   | `consulta` | consulta | Auxiliar de Enfermería | — |

   Más `admin` / `cambiar-esta-clave` (admin_sgc) de `npm run admin:asegurar`, que pide
   cambiar la clave. La demo trae 5 áreas y 9 cargos con jerarquía, y **30 documentos con 34
   versiones** (28 vigentes, 2 obsoletas, 3 en borrador y 1 anulada), con la convención del hospital
   (`PROCESO-TIPO-NN`), dos plantillas (`SGC-FO-04` y `SGC-FO-05`), un restringido (`GTH-FO-01`) y
   **cinco trámites** en distintas etapas, de `SOL-…-001` a `SOL-…-005`. Desde la Fase 12 trae además
   la marca de Suaza (sigla `HNSF`, primario `#1b4e8e`, secundario `#2e9b47`, el lema actual y el logo
   demo `src/db/semillas/recursos/logo-demo.png`, un monograma propio, no el escudo real) y una
   notificación "Bienvenida al SGC Integral" sin leer por usuario demo; todas las cuentas
   nacen con tema `claro`.
   `npm run db:seed:minima` deja una instalación nueva: "Entidad sin configurar", sigla
   `SGC`, los mismos dos colores, sin logo y lema vacío, aviso de datos de ejemplo, 11
   tipos de documento con su autoridad, formato del código, plazos y ocho ítems de lista; sin
   mapa, áreas, documentos ni usuarios (después hay que correr `admin:asegurar`). Una base
   heredada de `sgc-suaza` entra sin formato (sigue validando con su `patron_codigo` y no propone
   código), con todos los tipos operativos y **sin ítems en la lista de verificación**: el
   Administrador del SGC los fija en **Configuración documental** y **Tipos de documento**.
   **La base de desarrollo se resembró varias veces en la 13A** (Tareas 2 y 15, sus arreglos y el
   cierre): cada vez se pierden los datos de prueba manual y `admin` se recrea con la `ADMIN_CLAVE`
   de `.env.local` y cambio obligatorio.
5. **Tests:** 2805 en 118 archivos, en serie (`fileParallelism: false`), contra la BD de
   desarrollo sembrada y **conectados como `sgc_app`**, igual que la app; el test de
   privilegios usa además `DATABASE_URL_MIGRADOR`. Los usuarios de prueba con historia
   (`zz_<algo>_<timestamp>`) se acumulan porque no se pueden borrar (F11-D2); `db:seed` los
   limpia. `tests/semilla-tramites.test.ts` lee el estado de la demo: si ya se usó, salta lo que
   dependa de ella con un aviso. `SEMILLA_RECIEN=1 npm test`, con la base recién sembrada, convierte
   esos saltos en fallos. Tras correr la suite conviene resembrar: deja usuarios `zz_*` y `admin_sgc`
   de prueba que inflan los selectores de designación. Un rojo es una señal real (salvo el
   intermitente de la Deuda técnica).
6. **CI (decisión de la bifurcación, tomada por Claude):** lint y build corren en cada
   push; el job de imagen ARM64 (GHCR + artefacto `.tar`) solo corre con **Actions →
   CI → Run workflow**. Motivos: la cuota de almacenamiento de Actions es de la cuenta y
   la comparte con `sgc-suaza` (se agotó el 2026-08-25) y cada build ARM64 por QEMU es
   lento. La imagen `amd64` del CI llega en la Fase 20. La Fase 11 añadió `otpauth`,
   `qrcode` y `zod` (todos JS puro); las Fases 12 y 13A no añadieron dependencias. No consta que el
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
3. **Elaborar (`lider.cex`).** Pulse **Plantilla vigente** (`SGC-FO-05`) y descárguela. Suba
   un PDF como **Principal (lectura)**. Escriba el **Control de cambios**: con el texto sin
   guardar, **Enviar a revisión** queda desactivado. Guárdelo, envíe y firme con la clave. Una
   clave errada dice «Clave o código incorrectos» y conserva lo demás.
4. **Revisar (`coordinadora.sgc`).** Responda toda la lista con un ítem crítico en **No
   cumple**, pulse **Guardar avance** y firme **Dar concepto favorable**: «Hay un ítem crítico
   que no cumple». Deje dos observaciones y **Devolver a elaboración**. Como `lider.cex`: vea la lista de la ronda 1,
   responda las dos y reenvíe. Como revisora: en la ronda 2 la lista llega propuesta y el
   botón queda desactivado hasta **Guardar avance**. Cierre las observaciones y dé el concepto
   con su clave. Atajo: SOL-2026-002 ya está en la ronda 2.
5. **Aprobar y publicar en un acto (`coordinadora.sgc`).** En un operativo, por ejemplo
   SOL-2026-002: **Aprobar y publicar** → **Firmar, aprobar y publicar**. Debe verse: Publicado,
   versión 1 obsoleta y versión 2 vigente; **Listado Maestro** con «En la plataforma» en
   **Aprobación**; **Acta de aprobación** con cuatro firmas y una sola huella.
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
12. **Vencidos, tareas, cancelar y reasignar.** La bandeja muestra SOL-2026-003 «Vencido hace 2
    días». El aviso «Solicitud SOL-2026-003: venció el plazo de publicación» llega a los Admin
    SGC con la primera página que alguien cargue (la revisión corre como mucho cada diez
    minutos). **Mis tareas** de cada usuario lista lo suyo. Para ver el escalamiento sin tocar
    la base, baje **Días para avisar al jefe** a 1: en la siguiente revisión `gerente` recibe
    «… el paso de publicación sigue vencido», sin título y sin enlace. Devuélvalo a 3. Reasigne
    y cancele un trámite abierto: quien entra y quien sale reciben aviso, y la versión cancelada
    queda Descartado.
13. **Verificación técnica:** hecha al cierre. `npm run lint`, `npm test` (2805/2805 en 118 archivos) y
    `npm run build` en verde; la imagen del compose arranca, dice «Migraciones al día» y
    `/api/salud` responde `{"estado":"ok"}`. La 0004 se aplicó sobre una copia con el esquema y la
    demo de `main`. Falta el CI: corre al publicar la rama. En 9081 `/marca/logo` da 404 porque la
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
    cierre (Punto de reanudación, punto 1); el CI corre al publicar la rama.

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
2. Entrar como `admin` / `cambiar-esta-clave` → **Cambie su clave inicial** (12 a 128
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
  vencimientos cada diez minutos como mucho, disparada por el cascarón.
- **Semillas:** la demo adopta la convención del hospital (`CAL` → `SGC`, `FT` → `FO`, códigos
  `PROCESO-TIPO-NN`), añade `coordinadora.sgc`, dos plantillas, un restringido y cinco trámites
  sembrados con las reglas reales; la mínima trae 11 tipos con su autoridad, formato, plazos y
  ocho ítems de lista. Se resembró en las Tareas 2 y 15, en los arreglos y al cierre.
- **Manual:** capítulo 5 nuevo; capítulos 1 a 4 corregidos donde esta entrega los dejó falsos.
- **Verificación al cierre:** lint limpio; 2805/2805 tests en 118 archivos; build como el CI; compose con
  «Migraciones al día» y `/api/salud` `{"estado":"ok"}`. Sobre una copia con la demo de `main`
  (28 documentos y 29 versiones) la 0004 dejó 5 migraciones y los datos intactos: todas las
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
| F13A-DC12 | El acta la ve quien ve la versión, sale sin marca de agua y se genera si falta | ISO 7.5.3.1 a) | Una regla en la ruta del acta |
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

## Deuda técnica conocida

**De la Fase 13A:**

- **Botones con `disabled:opacity-*`** (F13A-R30): `estructura/page.tsx`, `FormAccion`,
  `FormularioVersionCliente`, `BotonRestablecer`, formularios de estructura, mapa, usuarios, lote
  y cuenta, y `components/ui/button.tsx`. `AGENTS.md` prohíbe `opacity` para atenuar controles:
  **Fase 19**.
- **Lista de verificación vacía en una base heredada:** la 0004 crea la tabla sin filas y, sin
  ítems activos, `validarConcepto` deja pasar el concepto favorable sin lista, con lo que el PC-05
  queda sin evidencia. Se vio aplicando la 0004 sobre la demo de `main`; el manual lo advierte. El
  ensayo de la **Fase 20** debe sembrar los ocho ítems o exigir al menos uno activo.
- **Sin prueba de concurrencia real** en aceptación y firma: `revertida` usa una sola transacción.
  Doble clic y dos aceptaciones simultáneas están razonados sobre los candados, no ejercitados.
- **Dos reasignaciones en la misma etapa y ronda** no se detectan como pestaña vieja: gana la
  última y las dos quedan en el historial.
- **`misTareas` corre dos veces en `/`** (cascarón y página), hasta cuatro consultas.
- **`src/db/semillas/demo.ts` tiene unas 1150 líneas:** los trámites sembrados se pueden separar.
- **Relaciones `(A,B)` y `(B,A)` heredadas** no se unen (F13A-R27).
- M12 no se hizo (F13A-R34): recargar a mitad de un formulario pierde lo escrito sin avisar.
- Al firmar con una cuenta ya bloqueada o inactiva, la sesión se cierra y `/ingreso` no dice por
  qué: el mensaje fijo solo sale cuando ese intento bloquea la cuenta.
- **Actas ya emitidas:** R33 y la redacción de observaciones cambian los bytes del PDF. Si en una
  instalación real se pierde un acta generada antes de esos cambios, no se regenera idéntica y
  queda `acta_no_regenerable` en la bitácora.
- Sin aviso a los líderes del proceso nuevo si el propietario cambia al aceptar o al corregir
  (F13A-R7, R23). Carrera posible en `codigoAbandonado` (F13A-R23).
- La huella que muestra el diálogo de firma puede ser vieja con dos pestañas; la firma guarda la
  actual. `candidatosDe` ofrece a quien ya firmó `elaboro` y el servidor lo rechaza con mensaje.
- El crítico se evalúa con la marca copiada al guardar: un ítem vuelto crítico después no bloquea
  hasta guardar de nuevo. Devolver con marcas sin guardar las pierde. `bloquearComo` usa las
  reglas de devolver y enviar como sustituto de persona y etapa.
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
  en `admin.ts`. `tramites.documento_id` no tiene índice propio. `diaLocal` crea un
  `Intl.DateTimeFormat` por llamada. Un `patron_codigo` vacío compila a `RegExp("")` y acepta todo
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
