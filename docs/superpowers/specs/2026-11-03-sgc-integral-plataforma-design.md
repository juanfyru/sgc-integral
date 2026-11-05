# SGC Integral — Diseño de la plataforma (Fases 11 a 20)

> Estado: **aprobado por el usuario el 2026-11-03** ("aprobado"), tras una ronda de
> revisión de un subagente constructor y dos respuestas del usuario (§2, puntos 14 y 15).
> Escrito el mismo día a partir de la sesión de diseño. Reglas permanentes en `AGENTS.md`
> (**su sección de hardware queda superada por §4 de este documento hasta que la Fase 11
> la reescriba**); estado vivo en `CONTEXT.md`; fases en `PLAN.md` §Fases de la variante
> SGC Integral.

## 0. Cómo leer este documento

El texto distingue tres niveles de autoridad:

- **[Usuario]**: lo que el usuario dijo o pegó. Se cita textual donde importa.
- **[Interpretación aceptada]**: lectura de Claude que el usuario leyó y no objetó
  ("así está bien", "entran con tus interpretaciones").
- **[Decisión de Claude]**: elección técnica de Claude, presentada como tal. El usuario
  puede revertirla; §10 las resume para revisarlas de una vez.

Cada recomendación incorporada lleva su base: **ISO** (cláusula de ISO 9001:2015),
**Regulación** (norma colombiana) o **Práctica** (buena práctica sin cláusula detrás).

Este documento fija el **qué** y las decisiones estructurales de toda la ampliación. El
detalle de cada fase (columnas exactas, pantallas, plantillas de correo, gramática
completa de fórmulas, tabla de transiciones, textos) se escribe en la especificación de
esa fase, siguiendo la metodología ya fijada en `PLAN.md`: propuesta → spec en
`docs/superpowers/specs/` → plan en `docs/superpowers/plans/` → ejecución → cierre con
`CONTEXT.md` actualizado e instrucciones de prueba.

## 1. Intención y porqué

SGC Documental (`sgc-suaza`, Fases 0–10) resuelve el control de documentos de ISO
9001:2015 (numeral 7.5) para **un solo administrador** y **consulta abierta** en una
intranet sin internet. SGC Integral toma esa base, que funciona y tiene 205 tests en
verde, y la convierte en una **plataforma de gestión de calidad**: usuarios con roles,
flujo documental con aprobaciones firmadas, indicadores, planes de mejoramiento,
notificaciones, tablero gerencial, reportes, trazabilidad reforzada y respaldos
verificados. Debe poder instalarse **en varias entidades**, cada una con su propio
servidor y base de datos, con su nombre, logo y colores.

Lo que debe lograr, en palabras del usuario: "todo tiene que estar funcional"; "un
desarrollo estructurado y lógico para que podamos ir probando la aplicación"; una
apariencia "moderna tipo Linear" en la que "los colores utilizados indiquen algo
(relevancia)" y "no tan monocromático"; y seguridad "para evitar hackeos" que cubra como
mínimo una lista de 20 riesgos (§5.9).

El sistema sigue existiendo para hacer imposible el hallazgo "documento desactualizado en
circulación", y ahora además para que la evidencia que pide un auditor de 7.5, 9.1, 9.3
y 10.2 **salga de la plataforma** en vez de armarse a mano.

## 2. Hechos fijados por el usuario (2026-11-03)

1. **Despliegue.** La app deja el QNAP. Irá a "otro servidor", "físicamente dentro del
   hospital", que "lo administra un funcionario del hospital", "su sistema operativo es
   Windows"; "la decisión de exponerla a internet todavía no se ha decidido pero es
   posible". No se sabe aún si desde ese servidor se alcanza el correo institucional.
2. **Acceso.** "Todo requiere iniciar sesión, el portal ya no será abierto".
3. **Usuarios.** "Serán más de 40 usuarios, se crearán a mano en la aplicación".
4. **Perfiles.** Cinco: administrador del SGC, Gerencia, Control Interno, líder de
   proceso, consulta. La matriz base de §5.1 quedó "así está bien por el momento".
5. **Orden de fases.** El orden 11 → 20 de §8 "está correcto".
6. **Motor único de acciones** para los tres módulos: "así está bien, un solo motor de
   acciones".
7. **Jerarquía de cargos.** "Creo que sí es necesario modelar una jerarquía de cargos";
   el modelo de §5.2 quedó "así está bien, continuemos".
8. **Documentación final obligatoria:** "Manual de usuario, manual técnico de
   administración y procedimiento de respaldo y restauración".
9. **Instalación por entidad.** "Significa una instalación independiente por entidad, cada
   una con su servidor y base de datos"; "se podrá configurar ciertos colores y logos".
10. **Dirección visual.** "Me gusta la C, pero con el modo oscuro como opción" (C = clara
    con color de módulo y estado visibles; ver §5.11).
11. **Contenedores sin atar el sistema operativo.** "Utilicemos contenedores aunque no lo
    cerremos a un sistema operativo ya que este cliente puede utilizar Windows pero otro
    tendrá Linux".
12. **Seguridad.** El mapa de 20 riesgos de §5.9 y las adiciones al stack (zod, Caddy,
    librería TOTP) quedaron "así está bien por el momento".
13. **Recomendaciones aceptadas y rechazadas**, por módulo: Documentación 1–8 y 12
    (fuera 9, 10, 11); Indicadores 1–6 (fuera 7); Planes de mejoramiento las 6 "con tus
    interpretaciones"; transversales 3–12 (fuera 1 y 2). Detalle en §6.
14. **Cuentas.** Tras la revisión del constructor: "es una cuenta personal" para cada
    funcionario que consulte; no hay puestos compartidos. El total real de cuentas está
    por confirmar (§11).
15. **La app original.** "Todavía no se ha instalado, pero pronto se piensa instalar en
    otro hospital": `sgc-suaza` no operará en Suaza; SGC Integral arranca allí desde
    cero, y la otra entidad podrá pasar de `sgc-suaza` a SGC Integral más adelante.

## 3. Metas, no metas y anti-metas

**Metas**

- Cada fase termina en algo que el usuario prueba en el navegador, con instrucciones.
- Nada de lo heredado deja de funcionar: mapa data-driven, una sola versión vigente,
  búsqueda, Listado Maestro, bitácora, marca de agua, subida validada.
- La plataforma produce por sí misma la evidencia de auditoría: actas de aprobación,
  acuses de lectura, copias controladas, normograma, resultados de indicadores con
  análisis, planes con verificación de eficacia, informe de revisión por la dirección.
- Seguridad diseñada **como si la app fuera a estar expuesta a internet**, aunque al
  final quede en la red interna.
- Un mismo procedimiento de instalación, actualización, respaldo y restauración en
  Windows y en Linux.
- La entidad nunca queda atrapada: exportación completa de datos y archivos en formatos
  abiertos.

**No metas** (fuera de alcance, explícitamente)

- Multi-tenancy: una instalación atiende una sola entidad.
- Editor de roles o permisos configurables por pantalla: la matriz es fija en código.
- Ingreso con Active Directory, OAuth o cuentas externas: los usuarios se crean a mano.
- Módulo de gestión de riesgos (solo un enlace opcional desde el hallazgo).
- Contenido propio del SOGC (estándares de habilitación, PAMEC) como módulo: PAMEC y
  habilitación entran solo como **origen** de hallazgos y como procesos del mapa.
- Consulta de fuentes legales externas para el normograma.
- Editor de texto enriquecido: los campos largos son texto plano con saltos de línea.
- Carga masiva de mediciones desde Excel (rechazada por el usuario).
- Aplicación móvil nativa (la web sí es responsive).
- Reemplazar el PDF por impresión con Chromium del lado del servidor.

**Anti-metas** (sería un fracaso aunque "funcione")

- Que un perfil sin permiso vea o descargue una versión no vigente como si lo fuera.
- Que la misma acción de mejora exista en dos registros distintos.
- Una aprobación sin concepto escrito ni firma verificable (la carga histórica de §6.1
  es un registro marcado como externo, no una aprobación de la plataforma).
- Un respaldo que falla en silencio o que nadie ha probado restaurar.
- Perder trazabilidad al añadir roles: toda escritura sigue en bitácora, con usuario.
- Que la interfaz nueva siga pareciendo "software del Estado".
- Que la seguridad dependa de que el servidor esté en la red interna.

## 4. Restricciones y piso de despliegue

### 4.1 El nuevo piso

- **Un servidor por entidad.** En Suaza: Windows, dentro del hospital, administrado por
  un funcionario, posible exposición a internet. Otra entidad puede traer Linux.
- **Contenedores, independientes del sistema operativo.** Una sola unidad de despliegue:
  `docker compose` con tres contenedores, `proxy` (Caddy, TLS), `app` (Next.js
  standalone) y `bd` (PostgreSQL 16). [Decisión de Claude: Caddy; ver §10.]
- **Imagen multi-arquitectura.** `linux/amd64` en cada versión publicada; `linux/arm64`
  bajo demanda (el job manual del CI ya existe) por si otra entidad trae un NAS.
- **Datos en volúmenes nombrados de Docker:** `bd_datos`, `almacen` (archivos),
  `respaldos`. PostgreSQL nunca sobre carpetas NTFS, SMB ni bind mounts de Windows (se
  corrompe o se arrastra). En Windows los volúmenes viven en el disco virtual de WSL2.
- **Windows: Docker Engine dentro de WSL2** (Ubuntu LTS con systemd), arrancado por una
  tarea programada "al iniciar el sistema", de modo que la app sube sin que nadie inicie
  sesión. **No Docker Desktop**: corre en la sesión del usuario y puede requerir
  suscripción de pago según el tamaño de la entidad (umbral de 250 empleados / USD 10 M
  de ingresos). Requiere Windows 11 o Windows Server 2022 o posterior con virtualización
  habilitada; si el servidor es más antiguo, la alternativa es una máquina virtual Linux
  en Hyper-V con Docker Engine. **Pendiente confirmar la versión de Windows con
  sistemas** (§11). [Decisión de Claude.]
- **Linux:** Docker Engine + plugin de compose, mismo compose.
- **Cero dependencias externas en runtime** se mantiene (fuentes e íconos empaquetados,
  sin CDN ni telemetría): ya no por falta de internet sino porque el servidor puede no
  tener salida y porque nada del uso interno debe salir del hospital.
- **Puertos.** El proxy publica 80 y 443 en el host (configurables). `app` y `bd` solo en
  la red interna de Docker; el puerto de PostgreSQL nunca se expone al host.
- **TLS siempre.** Con dominio público: certificado automático (ACME) en Caddy. Solo
  intranet: certificado de la autoridad interna del hospital si existe, o el certificado
  interno que Caddy genera, con el procedimiento para confiar en él en los equipos.
  HSTS activo cuando hay TLS.
- **Actualización:** `docker compose pull && docker compose up -d`; las migraciones corren
  en el arranque del contenedor con el mecanismo existente (`arrancar.js`, F10-D2). Sin
  internet en el servidor, sigue disponible la carga del `.tar` (D4) como camino alterno.
- **Zona horaria por instalación:** variable `ZONA_HORARIA`, por defecto
  `America/Bogota`. Toda fecha de corte, periodo, resumen diario y foto mensual se calcula
  en esa zona; la base de datos guarda `timestamptz`.
- **Recursos.** Se asume x86-64 y memoria holgada frente al NAS (8 GB o más). Los límites
  por contenedor se fijan en la Fase 20 contra el servidor real; mientras tanto el compose
  de desarrollo no impone límites.
- **Continuidad con `sgc-suaza`.** Las migraciones de SGC Integral se escriben de modo
  que puedan aplicarse sobre una base de datos de `sgc-suaza` (misma línea de esquema
  hasta `9644ceb`): nunca se renombra ni se borra una tabla o columna heredada; solo se
  añade o se deja de usar. Así, si la app original llega a operar en el QNAP mientras se
  construye esta, migrar es restaurar su respaldo (base y `almacen`) en la instalación
  nueva y arrancar. La razón ya no es Suaza (allí la original no se instala) sino el
  otro hospital que pronto la tendrá: su camino de actualización a SGC Integral es ese.
  [Decisión de Claude.]
- **Una sola instancia de app.** El rate limiting en memoria (`src/lib/limite.ts`) sigue
  valiendo; detrás del proxy la app toma la IP del cliente del encabezado
  `X-Forwarded-For` **solo** porque el único camino de entrada es Caddy (configurable con
  `CONFIAR_PROXY=1`). Ver §5.9 sobre límites por IP cuando todo el hospital sale por una
  misma dirección.

### 4.2 Reglas heredadas superadas

Hasta que la Fase 11 reescriba `AGENTS.md`, esta tabla manda sobre su sección
"Restricciones INVIOLABLES (hardware)" y sobre las reglas de negocio 3 y 4.

| Regla o decisión heredada | Estado | Qué la reemplaza |
|---|---|---|
| Hardware 1: ARM64 obligatorio | Superada | `linux/amd64` en cada versión; `arm64` bajo demanda |
| Hardware 2: NAS sin internet, `.tar` offline, cero CDN | Parcial | Cero CDN **se mantiene**; `.tar` offline pasa a ser camino alterno |
| Hardware 3: ~2 GB RAM, solo dos contenedores, prohibidos servicios extra | Superada | Tres contenedores (proxy, app, bd); límites en Fase 20. Sigue prohibido añadir motores (Redis, Elasticsearch, Chromium) sin proponerlo |
| Hardware 4: datos de PostgreSQL jamás en SMB/CIFS | Se mantiene | Volumen nombrado de Docker |
| Hardware 5: puertos de QTS, proxy y TLS nativos del NAS | Superada | Caddy en contenedor, 80/443 |
| Hardware 6: puerto de PostgreSQL nunca al host | Se mantiene | Igual |
| Negocio 3: "el endpoint público jamás sirve no vigentes" | Reformulada | No hay endpoint público. Regla de visibilidad por rol de §5.3 |
| Negocio 4: "acceso público solo lectura; escritura solo admin" | Reformulada | Toda ruta exige sesión; toda escritura exige además el permiso de la matriz (§5.1) |
| Negocio 1, 2, 5, 6, 7, 8 | Se mantienen | Una sola vigente en la misma transacción; obsoletos se retienen; bitácora; MIME por magic bytes; archivos fuera del webroot; mapa en BD |
| D3: auth propia para **un solo admin** | Parcial | La auth propia se mantiene (cookie httpOnly, Argon2id, sesiones en BD); "un solo admin" queda superado por los roles |
| D4: despliegue offline por `.tar` | Opcional | `docker compose pull` cuando hay internet |
| D8: trazabilidad de consulta por IP + user-agent | Ampliada | Usuario + IP + user-agent (el usuario pidió "usuario, IP y fecha" en el registro de accesos) |
| D40 / F10-D4: admin creado por variables de entorno | Se mantiene para el **primer** Admin SGC | Los demás usuarios se crean en la app |
| D7 / D53: PDF por hoja de impresión, sin Chromium | Se mantiene | `pdf-lib` para documentos formales (actas, copias controladas) |
| F9-D1: sin modo oscuro | Superada | Tema oscuro como opción del usuario (§5.11) |
| F9-D2 / D22: animación solo CSS, sin Motion | Se mantiene | Motion solo si una interacción concreta lo exige, propuesto antes |
| F10-D6: respaldo por crontab de QTS | Superada | Respaldo ejecutado por la app (§5.8) |
| "Una sola persona administra" (datos del entorno, 2026-07-15) | Superada | 40+ usuarios, mínimo dos Admin SGC recomendados |
| Stack, fila "Auth (solo admin)… Un solo usuario admin" | Superada | §5.1 |
| Rate limiting en memoria, instancia única | Se mantiene | Con IP tomada del proxy |

Las reglas de negocio 1, 2, 5, 6, 7 y 8 de `AGENTS.md`, las convenciones de código, la
metodología y el estilo de commits siguen vigentes sin cambios.

## 5. Arquitectura transversal

### 5.1 Identidad, roles y acceso

**Modelo.** Cada usuario tiene **un solo rol**, fijo en código (`admin_sgc`, `gerencia`,
`control_interno`, `lider_proceso`, `consulta`), más una **asignación de procesos**
(tabla `usuario_procesos`, muchos a muchos) que delimita sobre qué opera. Los roles no se
editan desde la app: con 40 usuarios y 5 perfiles, una matriz fija y probada por tests
se defiende mejor en auditoría que un editor de permisos. [Interpretación aceptada.]

- La asignación de procesos **restringe** al líder de proceso. Para Gerencia y Control
  Interno solo sirve como filtro por defecto, no como permiso. Un usuario puede ser
  líder de varios procesos.
- `consulta` es el rol por defecto al crear una cuenta. Subir de privilegio es un acto
  explícito y auditado.
- **Separación de funciones.** Dos reglas duras, verificadas en el servidor: **quien
  elabora no aprueba** y **quien ejecuta no verifica**. Publicar es un acto
  administrativo posterior a la aprobación: lo hace Admin SGC aunque haya solicitado el
  cambio o hecho la revisión, así que una instalación con un solo Admin SGC nunca se
  bloquea. Si el Admin SGC elabora un documento, lo aprueba el rol que el tipo de
  documento define (Gerencia o líder), nunca él mismo. [Decisión de Claude, precisada
  tras la revisión del constructor.]
- **Dos Admin SGC como mínimo.** La pantalla de usuarios muestra una advertencia
  permanente mientras haya uno solo; no bloquea. [Decisión de Claude: advertir, no
  bloquear, para no trabar el arranque de una instalación nueva.]

**Matriz base** (aprobada "por el momento"; cada módulo la desagrega en su spec):

| Área | Admin SGC | Gerencia | Control Interno | Líder de proceso | Consulta |
|---|---|---|---|---|---|
| Documentos | Todo: crear, publicar, anular, mapa, tipos, listas, normograma | Ver vigentes; **aprobar** según tipo | Ver vigentes e historial de versiones; observar | Proponer borradores de sus procesos; ver sus borradores; elaborar y revisar cuando se le designe | Ver vigentes |
| Indicadores | Ficha técnica, metas, cierre de periodos | Ver todo, comentar | Ver todo, observar | Registrar mediciones y análisis de sus procesos o de los indicadores que se le designen | Ver resultados |
| Planes de mejoramiento | Crear, asignar, cerrar | Ver, aprobar | Crear desde auditoría, hacer seguimiento, verificar eficacia | Ejecutar actividades, reportar avance, subir evidencias de sus procesos | Ver |
| Usuarios y estructura | Sí | No | No | No | No |
| Tablero gerencial | Completo | Completo | Completo | Solo sus procesos | Resumen |
| Bitácora y accesos | Sí | No | Lectura | No | No |
| Respaldo y exportación | Sí | No | No | No | No |

**Implementación.** La matriz vive como datos en `src/lib/permisos.ts` (permiso →
roles), con un test por celda. Dos ayudantes obligatorios en todo módulo nuevo:
`requerirPermiso(sesion, permiso, recurso?)`, que lanza si falta, y `alcance(sesion)`,
que devuelve el filtro de procesos que **toda** consulta de datos de los módulos nuevos
aplica. La interfaz oculta lo que no se puede hacer; el servidor es quien niega.

**Ciclo de vida del usuario.** Cada funcionario que consulta tiene **cuenta personal**;
no hay cuentas compartidas por servicio o puesto [Usuario]. Admin SGC crea la cuenta
(usuario, nombre, correo institucional, cargo, rol, procesos), una por una o **por
lote** desde una plantilla descargable (CSV o Excel) que el sistema valida fila por fila
y reporta qué cuentas creó y cuáles rechazó, con clave temporal por cuenta y todo en
bitácora. [Decisión de Claude: la carga masiva que el usuario rechazó era la de
mediciones de indicadores; para dar de alta a toda la planta en la Fase 11 el lote es
la diferencia entre una tarde y una semana.] El sistema genera una **clave temporal** que se
muestra una sola vez en pantalla; si hay SMTP configurado, opcionalmente envía un enlace
de activación de un solo uso (48 h). En el primer ingreso: cambio de clave obligatorio y
aceptación del aviso de tratamiento de datos personales (§6.4.5). Las cuentas se
**desactivan**, nunca se borran (sus registros en bitácora y firmas deben sobrevivir);
desactivar cierra sus sesiones. Cambio de rol, de cargo y de procesos quedan en bitácora.

**Autenticación.**

- Hash Argon2id (existente). Sesión: cookie httpOnly, `SameSite=Lax`, `Secure`, token
  aleatorio cuyo SHA-256 es la clave en `sesiones`, 12 h deslizantes (D37, D38). Se
  añade una vista de **sesiones activas** para Admin SGC con cierre forzado, y un
  **cierre por inactividad** configurable (60 minutos por defecto) porque muchos equipos
  del hospital son compartidos (puestos de enfermería, consultorios). [Decisión de
  Claude.]
- **Política de clave:** mínimo 12 caracteres; rechazo de claves de una lista de
  comunes empaquetada en la imagen (sin consultar servicios externos); distinta del
  nombre de usuario. Sin caducidad periódica. [Decisión de Claude: NIST SP 800-63B
  desaconseja la rotación forzada; la protección viene del bloqueo, la lista y el
  segundo factor.]
- **Bloqueo por cuenta:** 5 intentos fallidos → 15 minutos, duplicando en cada bloqueo
  siguiente; Admin SGC puede desbloquear; todo queda en el registro de accesos. El límite
  por IP es secundario y más laxo (§5.9).
- **Segundo factor TOTP** (app de autenticación, funciona sin internet ni correo):
  opcional para cualquier usuario, con códigos de recuperación de un solo uso. La
  variable `EXIGIR_2FA_ROLES` (por defecto vacía) lo vuelve obligatorio para los roles
  listados, pensada para `admin_sgc,gerencia` cuando la app se exponga a internet.
- **"Olvidé mi clave":** con SMTP, enlace de un solo uso válido 1 hora; sin SMTP, Admin
  SGC restablece con clave temporal. El primer Admin SGC se sigue creando por variables
  de entorno (D40) y `ADMIN_FORZAR_CLAVE=1` sigue siendo su camino de rescate (F10-D4).
- **Reautenticación para firmar.** Aprobar, publicar y dar de baja exigen reingresar la
  clave (y el TOTP si está activo) dentro de la misma acción; el servidor la verifica y
  registra la firma (§6.1).

**Registro de accesos.** Tabla `accesos`: usuario (o nombre intentado), resultado
(ingreso, salida, fallo, bloqueo, desbloqueo, restablecimiento), IP, user-agent, fecha.
Lo ve Admin SGC completo y Control Interno en lectura.

**Guard.** `src/proxy.ts` pasa de proteger `/admin/:path*` a proteger **todo**, salvo
`/ingreso`, `/restablecer/*`, `/api/salud`, los activos estáticos de Next y los activos
de marca (logo) que la pantalla de ingreso necesita. El principio de dos capas no cambia:
el proxy solo mira si hay cookie; `requerirSesion()` valida contra BD en cada layout,
acción y handler. Las URL existentes (`/`, `/procesos/...`, `/documentos/...`,
`/buscar`), que hoy viven en la raíz de `src/app`, se conservan, ahora detrás del
ingreso; si el constructor las agrupa en un grupo de rutas, elige el nombre.

**Tests heredados.** Los tests que hoy afirman que las rutas públicas sirven vigentes
sin sesión **no se borran: se reescriben** para el rol `consulta` (misma garantía, ahora
con sesión). El total de tests no baja; los de `guardia` crecen a una prueba por rol y
ruta.

### 5.2 Estructura organizacional

Maestros editables por Admin SGC. [Interpretación aceptada.]

- **Áreas o dependencias:** Gerencia, Subgerencia Científica, Subgerencia
  Administrativa, Oficina de Calidad, Control Interno, servicios.
- **Cargos:** cada cargo pertenece a un área y tiene un **cargo superior** opcional. Esto
  es el organigrama (Gerente → Subgerente Científico → Coordinador de Urgencias →
  Enfermera jefe).
- **Usuario:** tiene **un cargo** y de ahí hereda área y supervisor. Campo opcional
  **jefe inmediato** por usuario para encargos y comités que el organigrama no refleja;
  si está lleno, prevalece.

Por cargo y no por persona: cuando alguien se retira, el supervisor de sus subalternos
no se rompe. El **rol de acceso es independiente del cargo**: un subgerente puede ser
`consulta`.

Consumen la jerarquía: escalamiento de alertas al supervisor (§5.6), reportes por área
(§6.3), listas de distribución por área o cargo (§6.1), y la sugerencia de aprobador por
defecto en el flujo documental (el superior del elaborador). Se carga como semilla desde
la planta de cargos vigente, que el usuario entregará (§11); después la mantiene el
admin. Supuesto: tres o cuatro niveles, razonablemente estable.

### 5.3 Visibilidad documental por rol (reemplaza las reglas 3 y 4)

El filtro "solo vigentes" deja de estar en una ruta pública y pasa a depender del rol y
de permisos explícitos. Ninguna versión no vigente se sirve sin ese permiso; la ruta de
archivos lo valida contra la sesión en cada descarga y conserva `Cache-Control:
no-store`.

| Estado de la versión | Quién la ve |
|---|---|
| Vigente | Todos los usuarios, sujeto al **nivel de acceso del documento**: general, o restringido a los procesos asignados más Admin SGC, Gerencia y Control Interno (§6.1, adición 6) |
| En trámite (elaboración, revisión, aprobación) | Participantes designados del flujo, Admin SGC, y el líder de los procesos del documento |
| Obsoleta o anulada | Admin SGC y Control Interno siempre. Cualquier otro usuario solo con el permiso individual **"ver historial completo"** que Admin SGC concede y revoca (es el "definir qué usuarios pueden ver las versiones obsoletas" de 1.6) [Decisión de Claude: rol base + permiso individual] |

Las versiones obsoletas y anuladas conservan su marca visual inequívoca (regla 2). La
regla 1 (una sola vigente, en la misma transacción, reforzada por índice único parcial)
no cambia: publicar es el último paso del flujo de §6.1.

### 5.4 Motor único de acciones

Un solo registro de acciones de mejora para toda la plataforma. [Usuario: "un solo motor
de acciones".] El módulo 3 es su cara principal (§6.3); el módulo 1 muestra la vista
filtrada "acciones de este proceso o documento" (1.10) y el módulo 2 abre acciones desde
un resultado desviado (§6.2, recomendación 1).

- **Origen** de cada hallazgo (campo obligatorio, enumeración fija): `documento`,
  `proceso`, `indicador`, `auditoria_interna`, `control_interno`, `autoevaluacion`,
  `revision_direccion`, `pamec`, `ente_externo`. Más una **fuente** descriptiva (qué
  auditoría, qué ente, qué fecha) que vive en el plan.
- **Jerarquía:** plan → hallazgos → acciones (tipo: corrección, correctiva, preventiva,
  de mejora) → actividades (responsable, fechas, % de avance, evidencias). Un hallazgo
  exige **análisis de causas** antes de formular acciones y una **verificación de
  eficacia** separada del cierre.
- **Máquina de estados del hallazgo** [Interpretación aceptada]: registrado → notificado
  al líder → aceptado, o **rechazado** con justificación (vuelve a quien lo emitió; solo
  procede para fuentes internas: un hallazgo de ente externo no se rechaza, se responde)
  → plan de acción formulado y **aprobado** → actividades **delegadas** → en ejecución →
  ejecutado → en **verificación** → cerrado eficaz, o **reabierto** si no fue eficaz. La
  tabla exacta de transiciones y quién puede ejecutar cada una va en la spec de la Fase
  15; la restricción fija es que **quien ejecuta no verifica**.
- Las entidades de los módulos 1 y 2 enlazan al motor por referencia (documento,
  proceso, indicador, medición), nunca duplican la acción.

### 5.5 Repositorio de evidencias

La tabla `archivos` existente se **generaliza** para servir a documentos, mediciones de
indicadores, actividades y hallazgos: todos comparten huella SHA-256, MIME por magic
bytes, almacenamiento fuera del webroot y la validación de `src/lib/subida.ts` (lista
blanca por extensión y magic bytes, 25 MB, nombres saneados). Cómo se modela la
pertenencia (columnas de contexto o tablas de enlace) lo decide el constructor en la
Fase 13, con tres restricciones: una sola tabla y un solo flujo de subida; ruta física
`almacen/<contexto>/<id>/<nombre-saneado>`; el control de acceso de un archivo es el de
la entidad dueña. No se aceptan SVG ni HTML como evidencia (riesgo de XSS al
visualizarlos). Las marcas de agua se describen en §6.1.

### 5.6 Notificaciones y tareas

**Dos canales, una fuente.** Una **campana** dentro de la app que siempre funciona, y
**correo** cuando sistemas confirme el SMTP institucional (pendiente, §11). La
configuración SMTP la carga sistemas por variables de entorno, nunca se escribe en
pantalla; Admin SGC solo ve si está activo, el último envío y un botón "enviar correo de
prueba". [Interpretación aceptada.]

- **"Mis tareas"** (aprobaciones, revisiones, reportes de indicador, actividades,
  verificaciones, acuses de lectura, copias por recoger) se **calcula** del estado de las
  entidades, no se duplica en una tabla; las **notificaciones** sí se almacenan (tabla
  `notificaciones`: usuario, tipo, entidad, leída). [Decisión de Claude.]
- **Cola de correo en base de datos** (`correos`: destinatario, asunto, cuerpo,
  intentos, estado, próximo intento) con reintentos escalonados; un SMTP caído nunca
  tumba una aprobación. La cola guarda el estado de cada envío por necesidad técnica,
  **sin pantalla de registro de envíos** (recomendación 1, rechazada) y **sin
  preferencias por usuario** (recomendación 2, rechazada).
- **Resumen diario** por usuario a primera hora (hora configurable, zona horaria de la
  instalación) para lo rutinario; **inmediato** para lo crítico: resultado rojo de
  indicador, hallazgo de ente externo, bloqueo de una cuenta con rol Admin SGC.
- Los correos llevan aviso y enlace; **nunca adjuntos ni contenido del documento**.
- **Escalamiento** (recomendación 3, Práctica): una tarea vencida más de N días
  (configurable, por defecto 3) se notifica también al supervisor por jerarquía (§5.2).
  Aplica a pasos del flujo documental, reportes de indicador y actividades de planes.
- **Verificación de correo** (riesgo 13): con SMTP activo, la dirección de cada usuario
  se verifica con un enlace antes de recibir notificaciones; hasta entonces solo recibe
  en la campana.
- **Librería:** `nodemailer` (JS puro). [Decisión de Claude; se confirma en la Fase 16.]

### 5.7 Trabajos programados

Hay trabajo que debe ocurrir sin que nadie abra una página: cola de correo, resumen
diario, escalamiento, recordatorios de fecha de corte, respaldo diario, vigilancia del
respaldo, foto mensual del tablero, exportación completa, limpieza de sesiones y tokens.

[Decisión de Claude] **Planificador dentro de la app**: un reloj interno que corre cada
minuto en el proceso de Node, una tabla `trabajos` (nombre, última ejecución, resultado,
bloqueo) y trabajos **idempotentes** que recuperan lo pendiente al arrancar (si la app
estuvo apagada a la hora del resumen, lo envía al subir). Reloj inyectable para probarlo
sin esperar. Admin SGC puede lanzar cualquier trabajo a mano y ver su última corrida. Se
descartó un contenedor de cron aparte: cuarto contenedor y una segunda configuración
que mantener en dos sistemas operativos, para una sola instancia de app.

### 5.8 Respaldo, restauración y exportación completa

[Decisión de Claude: el respaldo lo ejecuta la app, no el sistema operativo.] Una tarea
programada de Windows ataría el procedimiento a un sistema; un contenedor de respaldo
aparte duplicaría configuración. En su lugar:

- El planificador (§5.7) corre a diario `pg_dump -Fc` (cliente de PostgreSQL 16 incluido
  en la imagen de la app) más un empaquetado de `almacen`, los **cifra** en flujo con
  AES-256-GCM usando `RESPALDO_CLAVE` (en manos de sistemas; recomendación 10, Seguridad
  y Ley 1581 de 2012) y los deja en el volumen `respaldos` con fecha en el nombre.
  Retención: 30 días.
- Cada corrida se registra en la tabla `respaldos` (fecha, tamaño, huella, resultado).
  De ahí sale la **vigilancia**: si no hay respaldo exitoso de menos de 26 horas, el
  tablero del Admin SGC lo muestra y se notifica (recomendación 9, Práctica).
- **Copia fuera del servidor:** sistemas copia el volumen `respaldos` a un segundo disco
  o ruta de red con la herramienta del sistema (robocopy en Windows, rsync en Linux); el
  procedimiento de respaldo y restauración (Fase 20) documenta ambas. Los archivos ya
  salen cifrados.
- **Restauración:** un script que corre dentro del contenedor (`docker compose run --rm
  app node restaurar.js <archivo>`) descifra, restaura la base y los archivos y verifica
  conteos. El mismo en Windows y Linux.
- **Prueba de restauración semestral** (recomendación 11, Práctica) registrada en la app
  como tarea del Admin SGC con fecha y resultado; la app recuerda cuando vence.
- **Custodia de la clave:** sin `RESPALDO_CLAVE` los respaldos no se pueden leer. El
  procedimiento exige guardarla en el gestor de contraseñas de sistemas y una copia
  sellada fuera del servidor. La prueba semestral confirma que la clave custodiada sirve.
- **Exportación completa** (Admin SGC, desde la app): un ZIP con el volcado de la base
  en SQL plano, todos los archivos y cada entidad principal en Excel, para que la entidad
  nunca quede atrapada. Se genera en segundo plano, se descarga una vez y queda en
  bitácora.

### 5.9 Seguridad: mapa de los 20 riesgos del usuario

Cada fase que toque rutas o formularios trae sus criterios de aceptación de seguridad;
la Fase 19 es la auditoría final contra esta tabla, con evidencia por fila.

| # | Riesgo | Estado | Qué se hace y dónde |
|---|---|---|---|
| 1 | `.env` en GitHub | Cubierto | `.gitignore` excluye `.env*`. Refuerzo F19: escaneo de secretos en CI |
| 2 | API keys en el frontend | Cubierto | No hay claves de terceros; regla: ningún secreto en `NEXT_PUBLIC_*` (revisión F19) |
| 3 | RLS desactivado | Equivalente, trabajo | Nadie accede a la BD salvo la app. El "RLS" es `alcance()` aplicado en toda consulta de los módulos nuevos, con pruebas por rol que intentan leer datos de otro proceso (F11 en adelante) |
| 4 | Permisos solo en frontend | Trabajo | `requerirSesion()` + `requerirPermiso()` como primera línea de toda acción y handler (F11) |
| 5 | Sin rate limiting | Parcial | Hoy solo login y rutas públicas. Se extiende a toda mutación y carga por usuario, y por IP con umbral alto; bloqueo por cuenta (F11). Detrás de Caddy, la IP se toma de `X-Forwarded-For` solo con `CONFIAR_PROXY=1`; como todo el hospital puede salir por una sola dirección, el límite por IP es laxo y el control fino es por cuenta |
| 6 | SQL concatenado | Cubierto | Drizzle parametriza; `sql` etiquetado con parámetros; regla: nunca `sql.raw` con entrada del usuario (revisión en cada fase) |
| 7 | Sin validación de inputs | Trabajo | Esquemas **zod** en la frontera de cada acción y handler nuevos; los formularios heredados migran al tocarlos (F11 en adelante) |
| 8 | HTML sin filtrar | Cubierto | React escapa; regla: sin `dangerouslySetInnerHTML`; campos largos en texto plano; CSP sin scripts inline |
| 9 | Contraseñas en texto plano | Cubierto | Argon2id. Se añade la política de §5.1 y claves temporales de un solo uso (F11) |
| 10 | Tokens en localStorage | Cubierto | Cookie httpOnly con token hasheado en BD. Verificación de `Origin` en todo handler que escribe (hoy solo en subida) (F11) |
| 11 | Admin sin login | Cubierto y ampliado | Todo exige sesión (F11) |
| 12 | CORS con `*` | Cubierto | No se emiten cabeceras CORS; verificación en F19 |
| 13 | Email sin verificar | Trabajo menor | Verificación por enlace cuando hay SMTP (F16) |
| 14 | IDs predecibles | Cubierto por diseño | El control es la autorización en cada acceso, no ocultar el ID; archivos solo por ruta autorizada; los tokens de un solo uso (activación, restablecimiento, exportación) son aleatorios de 32 bytes |
| 15 | Body entero en cada update | Trabajo | Cada acción acepta solo sus campos declarados (`zod` estricto); nunca se vuelca el cuerpo en un `update` (F11 en adelante) |
| 16 | Webhooks sin firma | No aplica | No hay webhooks entrantes; si algún día los hay, HMAC obligatorio |
| 17 | Stacktraces en producción | Verificar | Next los oculta; se revisa que las acciones devuelvan errores de negocio sin detalle interno y que los logs queden solo en el servidor (F19) |
| 18 | Dependencias desactualizadas | Trabajo | Subir Next 16.2.10 → 16.3.x **al inicio de la Fase 11**, antes de código nuevo; `npm audit` en CI fallando en alto o crítico; procedimiento de actualización en el manual técnico |
| 19 | Claves débiles o filtradas | Trabajo | Política de clave, bloqueo, TOTP opcional y exigible por rol; secretos (`SESION_SECRETO`, clave de BD, `RESPALDO_CLAVE`) generados al instalar (F11, F20) |
| 20 | Archivos sin validar | Cubierto y extendido | El mismo filtro de magic bytes y lista blanca para todas las evidencias; sin SVG ni HTML (F13 a F15) |

**Además de los 20** (aceptados en la sesión):

- **Bitácora inmutable en la base de datos** (recomendación 7, ISO 7.5.3.2): el rol de BD
  de la app **no puede** `UPDATE` ni `DELETE` en `auditoria`, `accesos` ni `firmas`;
  además un trigger que rechaza ambas operaciones, por si alguien entra con otro rol.
- **Rol de BD de mínimo privilegio** (recomendación 8, Seguridad): dos roles,
  `sgc_migrador` (dueño del esquema, corre migraciones en el arranque) y `sgc_app` (solo
  DML, sin DDL). Dos cadenas de conexión en el entorno. Se implementa en la Fase 11.
- Cabeceras: la CSP existente se mantiene estricta; HSTS, `Referrer-Policy` y
  `Permissions-Policy` se revisan en F19; `X-Frame-Options: DENY` se mantiene.
- **Pruebas por rol obligatorias en cada fase**: para cada entidad nueva, un test
  intenta leer y escribir con cada rol y con un líder de otro proceso.

### 5.10 Configuración por instalación y marca

Una instalación es una entidad. La marca y los parámetros viven en la tabla
`configuracion` (clave/valor, existente) y se editan desde una pantalla de Admin SGC:
nombre de la entidad, sigla, lema, logo, color primario y secundario, hora del resumen
diario, días de escalamiento, meses de revisión documental por defecto. Al guardar un
color, el sistema valida el contraste AA de los pares que lo usan con la función
existente `src/lib/contraste.ts` y rechaza el que falle. El logo se acepta en PNG, WebP
o JPG, no en SVG. [Decisión de Claude: evita el vector XSS de SVG; el logo vectorial se
convierte una vez a PNG de alta resolución.]

**Semillas.** Se separan dos: `semilla:minima` (roles, tipos de documento genéricos,
configuración vacía con el nombre "Entidad sin configurar", primer Admin SGC por
entorno) y `semilla:demo` (mapa real de Suaza, documentos ficticios, usuarios de
ejemplo por rol, indicadores y planes de muestra). La instalación de Suaza arranca con
la mínima más su mapa real; otra entidad carga su mapa desde el editor existente. La
marca visible deja de decir "SGC Documental" y toma el nombre configurado.

### 5.11 Sistema visual

**Dirección aprobada: C** (clara con color de módulo y de estado visibles desde lejos),
**con tema oscuro como opción** del usuario (claro, oscuro o según el sistema, guardado
en su perfil). Referencia "tipo Linear": tipografía compacta y bien jerarquizada,
bordes sutiles en vez de cajas y sombras, barra lateral por módulos, búsqueda global
con atajo `Ctrl K`, estados vacíos que dicen qué hacer, atajos de teclado en listas, y
color reservado para significar algo.

**El color es un sistema de tres capas**, y nunca se mezclan:

1. **Marca** (configurable por entidad): color primario y secundario. Identifica la
   institución: barra lateral, botón principal, acentos de la pantalla de ingreso.
2. **Módulo** (fijo): dice dónde estás. Documentos azul `#2a78d6` (oscuro `#3987e5`),
   Indicadores verde azulado `#1baf7a` (`#199e70`), Planes naranja `#eb6834` (`#d95926`).
   Validados en pares con el validador de daltonismo en claro y oscuro.
3. **Estado** (fijo, reservado): bien `#0ca30c`, atención `#fab219`, grave `#ec835a`,
   crítico `#d03b3b`, sin dato gris neutro. **Siempre con ícono o texto al lado**, nunca
   color solo. Estos colores no se reutilizan para series de gráficas.

Tipografía: Archivo (títulos) y Geist (interfaz), ya empaquetadas (D23). Íconos
`lucide-react`. Gráficas en SVG propio (sin librería), con las reglas ya aplicadas en el
dashboard existente más las del método de visualización: una sola escala por gráfica,
leyenda cuando hay dos o más series, etiquetas directas selectivas, tabla equivalente
accesible, tooltip al pasar, colores por entidad y no por posición. El tema oscuro se
deriva de los **mismos tokens** y se valida contra la superficie oscura; no es una
inversión automática.

Accesibilidad no negociable (heredada): teclado, foco visible, contraste AA,
`prefers-reduced-motion`, responsive a 390 px, estilos de impresión. Las maquetas de la
sesión (`.superpowers/brainstorm/.../direccion-visual-v3.html`, no versionadas) son la
referencia de la dirección C; la Fase 12 produce el sistema real.

## 6. Módulos

### 6.1 Documentación SGC (Fase 13)

> **Actualización del 2026-11-05.** El usuario contrastó esta sección con el procedimiento
> documentado del hospital, aceptó 14 cambios y partió la Fase 13 en tres entregas (13A, 13B
> y 13C). Donde difieran, manda el spec de cada entrega; el de la 13A
> (`2026-11-05-fase13a-flujo-documental-design.md`, §2 y §5) lista los cambios y el reparto.
> Lo más visible: aprueba Gerencia o el Coordinador SGC según el tipo (reemplaza la DC11), la
> clave se pide en cuatro momentos, la revisión lleva lista de verificación y el plazo de
> revisión por defecto pasa a 12 meses.

**Descripción del usuario** [Usuario, textual]:

> 1.1 Mapa y caracterización de procesos. Consultar el mapa de procesos y, desde él, la
> caracterización de cada proceso: objetivo, alcance, responsable, proveedores, entradas,
> actividades, salidas, clientes, recursos, indicadores y requisitos aplicables.
> 1.2 Documentos por proceso. Consultar en un solo lugar los formatos, protocolos,
> manuales, instructivos y normas asociados a cada proceso, con búsqueda por código,
> nombre, tipo de documento o proceso.
> 1.3 Procedimientos. Publicar y consultar los procedimientos institucionales vinculados a
> su proceso, con sus formatos y registros asociados.
> 1.4 Solicitud y control de cambios. Solicitar y justificar el cambio de un documento,
> dejando registro de quién lo solicita, qué se modifica, cuándo y quién lo aprueba.
> 1.5 Versionamiento automático. Al aprobarse un cambio, la plataforma asigna la nueva
> versión, actualiza el Listado Maestro de Documentos y marca como obsoleta la versión
> anterior.
> 1.6 Historial de versiones y obsoletos. Consultar el historial completo de versiones de
> cada documento y definir qué usuarios pueden ver las versiones obsoletas.
> 1.7 Flujo de aprobación. Tramitar cada documento por los estados de elaboración,
> revisión, aprobación y publicación, con recordatorios por correo a quien tenga tareas
> pendientes. Cada aprobación queda registrada con usuario, fecha y hora.
> 1.8 Listas de distribución. Definir listas por proceso, área o cargo que reciben aviso
> por correo cuando un documento se crea, se modifica o pasa a obsoleto.
> 1.9 Normograma. Registrar las normas aplicables a cada proceso (vigencia,
> modificaciones, derogatorias y documentos internos afectados) y generar automáticamente
> el normograma institucional y por proceso. Las normas se registran por la E.S.E.; la
> plataforma no consulta fuentes legales externas.
> 1.10 Acciones sobre procesos. Registrar y hacer seguimiento a las acciones preventivas,
> correctivas y de mejora de cada proceso o documento.
> 1.11 Semáforos y alertas documentales. Ver el estado de cada documento por colores y
> recibir alertas sobre documentos próximos a revisión, pendientes de aprobación o
> desactualizados.

**Lo que ya existe** (Fases 0–10): 1.1 el mapa (la caracterización es hoy una
descripción libre), 1.2 documentos por proceso con búsqueda FTS y facetas, 1.3
procedimientos con sus formatos relacionados (`documento_relaciones`), 1.5 versionamiento
automático con obsolescencia en la misma transacción y Listado Maestro. El trabajo real
está en 1.4, 1.6 a 1.11, la caracterización estructurada de 1.1 y las adiciones.

**Interpretaciones aceptadas:**

- "SOGC" del primer mensaje es este mismo módulo; estándares de habilitación y PAMEC no
  entran como contenido propio.
- **Actores del flujo:** elabora quien se designe (normalmente el líder del proceso),
  revisa el Admin SGC, aprueba Gerencia o el líder según el tipo de documento, y
  **publica siempre el Admin SGC**. Los participantes se designan por documento;
  elaborador y aprobador nunca son la misma persona. [Decisión de Claude: el rol que
  aprueba se configura **por tipo de documento**; cuando el tipo admite varios, la app
  sugiere al superior jerárquico del elaborador.]
- Las alertas de revisión necesitan un **plazo de revisión por tipo de documento** (por
  ejemplo, 24 meses) ajustable por documento; de ahí sale el semáforo.
- Normograma con tipo, número, año, entidad emisora, vigencia, modificaciones y
  derogatorias, vinculado a procesos y documentos internos; institucional y por proceso,
  exportables.
- Listas de distribución y recordatorios: los datos y la campana en esta fase; el correo
  en la Fase 16.
- 1.10 es el motor único de acciones (§5.4): aquí solo la vista filtrada por proceso o
  documento y el botón "abrir acción", que la Fase 15 conecta.

**Flujo documental (1.4, 1.5, 1.7).** Todo documento nuevo o cambio nace de una
**solicitud** con justificación: quién la pide, qué cambia, cuándo. El líder puede
solicitar para sus procesos; Admin SGC para cualquiera. Al aceptarla se abre una versión
nueva que recorre **elaboración → revisión → aprobación → publicación**. El estado
`borrador` existente se subdivide en esas etapas (si como columna nueva o tabla de pasos,
lo decide el constructor; el CHECK de estados y el índice único de "una sola vigente"
deben seguir válidos). En cada paso: asignado, fecha límite, **concepto escrito
obligatorio** (adición 3), posibilidad de **devolver a elaboración con observaciones**,
y **firma** (adición 4): reingreso de la clave en la acción, registro de usuario, fecha,
hora y huella SHA-256 del archivo principal en ese momento, en la tabla `firmas`.
Publicar sigue siendo la transacción actual (obsoleta la anterior, actualiza el Listado
Maestro) y genera el **acta de aprobación** en PDF con `pdf-lib` (documento, versión,
pasos, firmantes, fechas, huellas). Los recordatorios a quien tiene un paso pendiente
salen por campana (esta fase) y correo (Fase 16), con escalamiento (§5.6). La **baja**
de un documento (adición 7) recorre el mismo flujo con justificación.

**Carga histórica de documentos ya aprobados.** [Decisión de Claude, tras la revisión
del constructor.] El inventario actual del hospital (unos 200 documentos aprobados en
papel) y cualquier documento aprobado fuera de la plataforma **no recorren el flujo**:
Admin SGC los registra con la publicación directa que ya existe, anotando quién elaboró,
revisó y aprobó y la fecha de aprobación como texto. Esas versiones quedan marcadas de
forma visible como **"aprobación registrada fuera de la plataforma"**, no tienen acta ni
firmas, y el Listado Maestro y el semáforo las tratan como vigentes con su fecha de
aprobación. La **siguiente versión** de cada una sí pasa por el flujo completo. La
publicación directa queda restringida a Admin SGC, auditada, y se puede desactivar por
configuración cuando la entidad termine la carga inicial.

**Caracterización estructurada (1.1).** Por proceso, con los campos de la descripción:
objetivo, alcance, responsable, proveedores, entradas, actividades, salidas, clientes,
recursos, indicadores (enlace al módulo 2 desde la Fase 14) y requisitos aplicables
(enlace al normograma). Editable por Admin SGC y por el líder de ese proceso; cada cambio
queda en el historial antes/después (§6.4.3). No se versiona ni pasa por el flujo
(adición 10, rechazada). Se consulta desde el mapa.

**Historial y obsoletos (1.6).** Regla de §5.3.

**Listas de distribución (1.8) y acuse de lectura (adición 2).** Listas por proceso,
área o cargo, resueltas a usuarios en el momento del evento (creación, nueva versión,
paso a obsoleto). Cada miembro recibe la tarea **"confirmar lectura"**; el líder ve el
porcentaje de su proceso, Admin SGC el de todos, y hay reporte. Reemplaza las actas de
socialización en papel.

**Normograma (1.9).** Normas registradas por la entidad: tipo, número, año, entidad
emisora, título, estado (vigente, modificada, derogada), fecha, relaciones entre normas
(modifica a, deroga a), procesos y documentos internos afectados. Normograma
institucional y por proceso, exportables (Fase 17 les da el formato final). Sin fuentes
externas.

**Semáforos y alertas (1.11).** Por documento: **verde** vigente dentro de su periodo de
revisión; **atención** cuando la revisión vence en 90 días o menos (configurable);
**crítico** con revisión vencida; **en trámite** con la etapa y los días que lleva en
ella, y aviso cuando un paso supera su fecha límite. Las alertas van al responsable del
paso o al líder del proceso, con escalamiento.

**Adiciones aceptadas** (el usuario: "incluye las funcionalidades del 1 al 8 y el 12"):

| # | Adición | Base | Qué hace |
|---|---|---|---|
| 1 | Copias controladas impresas | ISO 7.5.3.1 a) | Registro de cada copia física: número, servicio o ubicación, responsable, fecha de entrega. Al publicar una versión nueva, el sistema crea la tarea "recoger copias obsoletas" por ubicación y la marca al cumplirse |
| 2 | Acuse de lectura | ISO 7.3 | Tarea de confirmar lectura para la lista de distribución; porcentaje por proceso; reporte |
| 3 | Concepto en cada paso | ISO 7.5.2 c) | Revisor y aprobador escriben su concepto y pueden devolver con observaciones |
| 4 | Firma con contraseña y acta | Regulación: Ley 527 de 1999 (firma electrónica simple) | Reingreso de clave al aprobar o publicar; usuario, fecha, hora y huella SHA-256; acta de aprobación PDF por versión |
| 5 | Documentos de origen externo | ISO 7.5.3.2 (último párrafo) | Marca "externo" con entidad emisora, versión adoptada y fecha de adopción; entran al Listado Maestro con control propio, sin versionarlos como internos |
| 6 | Nivel de acceso por documento | ISO 7.5.3.1 b) | General, o restringido a los procesos asignados más Admin SGC, Gerencia y Control Interno |
| 7 | Baja con aprobación | ISO 7.5.3 (control de cambios) | Anular pasa por el flujo con justificación; hoy el admin anula solo |
| 8 | Marca de agua con usuario | Práctica | El PDF descargado dice quién lo descargó, además de "copia no controlada" y la fecha |
| 12 | Indicadores del proceso documental | ISO 9.1 | Porcentaje de documentos dentro de su periodo de revisión, tiempo promedio de aprobación, documentos vencidos por proceso, porcentaje de acuses de lectura. Se calculan de los datos y alimentan el tablero |

**Rechazadas por el usuario** (no volver a proponerlas sin motivo nuevo): 9, retención y
disposición final por tipo (ISO 7.5.3.2 d), Ley 594): la gestión archivística sigue en su
proceso; 10, caracterización versionada por el flujo: se prefiere edición directa con
historial; 11, verificación periódica de integridad de huellas en disco.

**Salidas en PDF y marcas de agua.** [Decisión de Claude para resolver usos que hoy
comparten una sola marca.] Las versiones obsoletas y anuladas conservan su banda.

| Salida | Quién la produce | Marca |
|---|---|---|
| Vista o descarga normal de un vigente | Cualquier usuario con acceso | "COPIA NO CONTROLADA — descargada por <usuario> el <fecha> — verifique su vigencia en el SGC" (extiende D58) |
| Copia controlada impresa | Admin SGC desde el registro de copias | "COPIA CONTROLADA N.º <n> — <ubicación> — entregada a <responsable> — <fecha>". Nunca dice "no controlada" |
| Revisión dentro del flujo | Participantes del flujo | Original sin marca, con banda "EN TRÁMITE" en pantalla |
| Acta de aprobación | El sistema, al publicar | PDF propio generado con `pdf-lib` |

### 6.2 Indicadores (Fase 14)

**Descripción del usuario** [Usuario, textual]:

> 2.1 Ficha técnica. Crear cada indicador con su ficha técnica: tipo (estratégico,
> operativo, regulatorio u otro que defina la E.S.E.), fórmula, responsable,
> periodicidad, fuente y proceso.
> 2.2 Indicadores compuestos y por niveles. Definir variables y la fórmula que las
> relaciona, y desagregar un indicador en varios niveles para analizar su detalle.
> 2.3 Metas por periodo. Programar la meta de cada indicador para cada periodo de medición.
> 2.4 Semaforización. Clasificar automáticamente cada resultado por colores según los
> rangos definidos para el indicador.
> 2.5 Gráficas. Graficar el comportamiento del indicador y de sus variables en los
> periodos que se seleccionen, con los datos reportados en la plataforma.
> 2.6 Alertas por desviación. Avisar a los usuarios definidos cuando un resultado quede
> por fuera de los rangos establecidos.
> 2.7 Recordatorios de reporte. Enviar un recordatorio por correo al responsable cuando,
> vencida la fecha de corte, no haya reportado el indicador.
> 2.8 Análisis y evidencias. Registrar el análisis de cada medición y adjuntar los
> archivos de soporte.
> 2.9 Permisos por indicador. Definir por usuario qué puede hacer sobre cada indicador:
> consultar, reportar, hacer seguimiento, imprimir o administrar.

Todo es nuevo; la asociación a procesos, los usuarios y el motor de acciones le dan el
piso.

**Interpretaciones aceptadas:**

- **"Por niveles" (2.2)** es desagregación: el indicador define dimensiones (por
  servicio, por sede) con categorías, y la medición captura las variables por categoría.
  El total institucional se calcula **sumando variables**, nunca promediando
  porcentajes. **"Compuesto"** es un indicador cuyas variables son resultados de otros
  indicadores del mismo periodo.
- **La fórmula se evalúa con un intérprete propio** de aritmética básica (números,
  variables, suma, resta, multiplicación, división, paréntesis; el conjunto mínimo de
  funciones lo fija la spec de la Fase 14). Nunca se ejecuta texto del usuario como
  código. Admin SGC la prueba con valores de ejemplo al guardar la ficha. División por
  cero o variable faltante producen "sin dato" con el motivo.
- **Semáforo con dos modos:** por porcentaje de cumplimiento de la meta, o por rangos
  absolutos ("menor o igual a X"). Cada indicador declara si mejor es mayor, menor o
  dentro de un rango.
- **Permisos por indicador (2.9):** parten de la matriz de roles y la asignación de
  procesos, y por indicador se designan explícitamente **quién reporta** y **quién hace
  seguimiento** (tabla `indicador_usuarios`). **Administrar** queda solo en Admin SGC
  porque cambiar una fórmula altera la historia. **Imprimir** no se separa de consultar.
- **Fecha de corte:** días de plazo después de cerrar el periodo, configurables por
  indicador. Periodicidades: mensual, bimestral, trimestral, semestral, anual.
- Tipos de indicador en un maestro editable (`tipos_indicador`), con estratégico,
  operativo y regulatorio como semilla.
- Sin meta programada para un periodo, el indicador se mide pero no se semaforiza
  (se muestra "sin meta" en gris). [Decisión de Claude.]

**Recomendaciones aceptadas** (el usuario: "incluye las recomendaciones de la 1 a la 6"):

| # | Recomendación | Base | Qué hace |
|---|---|---|---|
| 1 | Resultado rojo abre acción de mejora | ISO 9.1.3 y 10.2 | Desde la medición desviada se crea la acción en el motor único con origen `indicador` (se conecta en la Fase 15) |
| 2 | Catálogo de variables compartidas | ISO derivada de 9.1.1 (resultados válidos) | Una variable se define una vez por proceso y los indicadores la reutilizan; se reporta una vez por periodo |
| 3 | Ficha técnica versionada | ISO derivada de 7.5.3.2 c) | Cambiar fórmula, meta base o rangos crea una versión nueva de la ficha con fecha de vigencia; las mediciones viejas conservan la suya |
| 4 | Cierre de periodo | ISO 7.5.3.2 y 9.1.1 | Admin SGC cierra el periodo; corregir después exige justificación y queda en bitácora con antes y después |
| 5 | "Sin dato" no es cero | Práctica | Un periodo no reportado se muestra vacío y en gris, nunca como 0 |
| 6 | Regulatorios ligados al normograma | ISO 4.2 y 8.2.2; Regulación: Resolución 256 de 2016, Circular Única | El campo "norma que lo exige" se toma del normograma; periodicidad externa y destinatario |

**Rechazada por el usuario:** 7, carga masiva desde Excel (Práctica).

**Estructura.** `indicadores` (identidad: código, nombre, proceso, tipo) más
`indicador_versiones` (fórmula, variables, unidad, periodicidad, fuente, responsable,
días de corte, sentido, modo de semáforo, rangos, vigencia desde). `variables` por
proceso con `valores_variable` por periodo y categoría. `metas` por periodo.
`mediciones` con resultado calculado, semáforo, análisis en texto, evidencias (§5.5) y
estado (pendiente, reportada, cerrada). Las **gráficas** muestran la serie por periodo
con la meta y las bandas del semáforo, las variables, y el comparativo por categoría, en
el rango que el usuario elija, con las reglas de §5.11; el periodo sin dato es un hueco.
Las **alertas por desviación** notifican de inmediato al responsable, a quien hace
seguimiento y a Admin SGC; el **recordatorio de reporte** sale al vencer la fecha de
corte (campana en esta fase, correo y escalamiento en la 16).

### 6.3 Planes de mejoramiento (Fase 15)

**Descripción del usuario** [Usuario, textual]:

> 3.1 Registro de planes. Registrar los planes de mejoramiento originados en entes de
> control externos y en fuentes internas: control interno, auditorías internas,
> autoevaluaciones y revisión por la dirección.
> 3.2 Gestión de hallazgos. Tramitar cada hallazgo por las etapas de notificación,
> aprobación, delegación, rechazo, verificación y cierre, con avisos por correo en cada
> etapa.
> 3.3 Actividades. Asignar actividades con responsable, fechas y porcentaje de avance;
> adjuntar evidencias y registrar su cierre con trazabilidad.
> 3.4 Alertas de atraso. Avisar por correo al responsable y a su supervisor cuando una
> actividad venza sin haberse cerrado.
> 3.5 Reportes de cumplimiento. Generar reportes de avance y cumplimiento por plan,
> origen, área y proceso.
> 3.6 Articulación con control interno. Relacionar cada plan y actividad con el proceso y
> el objetivo institucional correspondiente, para que Control Interno haga seguimiento al
> cumplimiento por proceso.

Es la cara principal del motor único (§5.4).

**Interpretaciones aceptadas** (el usuario: "entran las 6 recomendaciones con tus
interpretaciones"):

- Un **plan** agrupa hallazgos de un mismo origen y fecha (la auditoría de Contraloría
  de 2026, el ciclo PAMEC, la revisión por la dirección de marzo).
- Las etapas de 3.2 son la máquina de estados de §5.4.
- **"Supervisor" (3.4)**: tras decidir la jerarquía de cargos, es el superior del cargo
  del responsable o su jefe inmediato si está definido (§5.2). El líder del proceso ve la
  actividad atrasada en su tablero de todos modos.
- **"Área" (3.5)**: el maestro de áreas de §5.2; cada usuario pertenece a una y los
  planes la heredan del responsable. **Objetivos institucionales**: maestro editable que
  Admin SGC carga desde el plan de desarrollo.
- **Rechazo** solo hacia fuentes internas; un hallazgo de ente externo se responde.

**Recomendaciones aceptadas:**

| # | Recomendación | Base | Qué hace |
|---|---|---|---|
| 1 | Análisis de causas obligatorio | ISO 10.2.1 b) | Campo de causa raíz y método libre (cinco porqués, espina de pescado) antes de formular acciones |
| 2 | Verificación de eficacia separada del cierre | ISO 10.2.1 d) | Lo cierra quien no ejecutó (Control Interno o Admin SGC) con criterio, plazo y resultado eficaz o no eficaz; si no, se reabre |
| 3 | Cuatro tipos de acción | ISO 10.2 y 10.3 | Corrección, correctiva, preventiva (MECI la sigue usando), de mejora |
| 4 | Reincidencia | ISO 10.2.1 b) 3 | Al registrar un hallazgo se muestran los anteriores del mismo proceso y se puede marcar reincidente |
| 5 | Campos del formato de Contraloría y Supersalud | Regulación colombiana | Descripción, causa, efecto, acción, unidad de medida, cantidad, fechas, avance; el reporte sale en el formato que Control Interno ya entrega |
| 6 | Riesgo asociado | ISO derivada de 10.2.1 e) | Enlace opcional al riesgo del proceso: texto o maestro pequeño, sin módulo de riesgos |

Los **reportes de cumplimiento** (3.5) por plan, origen, área y proceso se listan en
esta fase; su versión formal en Excel y PDF llega con el catálogo de la Fase 17. Las
**alertas de atraso** (3.4) salen por campana aquí y por correo en la 16.

### 6.4 Funciones transversales

#### 6.4.1 Tablero gerencial (Fase 17)

Una pantalla con cuatro franjas: **estado documental** (vigentes, por vencer, vencidos,
en trámite por etapa), **indicadores del último periodo** (bien, atención, crítico, sin
dato), **planes de mejoramiento** (actividades vencidas, por vencer, cumplimiento por
origen) y una **matriz de pendientes por proceso**. Gerencia, Control Interno y Admin
SGC lo ven institucional; el líder, el de sus procesos; consulta, un resumen. Todos los
usuarios tienen además el bloque **"mis tareas"** al entrar (desde la Fase 12).

- **Informe de revisión por la dirección** (recomendación 4, ISO 9.3): por periodo, el
  sistema llena las entradas de 9.3.2 que ya tiene (desempeño de procesos, indicadores,
  no conformidades y acciones correctivas, resultados de auditoría, cambios
  documentales, estado de acciones de revisiones previas); Gerencia registra las salidas
  de 9.3.3 como **decisiones**, que se convierten en acciones del motor con origen
  `revision_direccion`. Exportable en PDF.
- **Foto mensual del tablero** (recomendación 5, Práctica): el planificador guarda cada
  mes el resumen del tablero para comparar sin recalcular.

#### 6.4.2 Reportes (Fase 17)

Catálogo cerrado, cada uno en Excel (`exceljs`) y PDF (hoja de impresión; `pdf-lib` para
los formales): Listado Maestro (existe), normograma institucional y por proceso,
caracterización de proceso, ficha técnica y resultados de indicadores, plan de
mejoramiento en formato Contraloría o Supersalud, cumplimiento por origen, área y
proceso, acuses de lectura, copias controladas por ubicación, bitácora y registro de
accesos. **Pie de control en todo reporte** (recomendación 6, ISO 7.5.2): fecha y hora
de generación, usuario, filtros aplicados, paginación. Cada exportación queda en
bitácora.

#### 6.4.3 Trazabilidad (Fase 18)

La bitácora existente se extiende a todas las entidades nuevas (cada fase audita lo
suyo; la 18 añade la vista unificada y los filtros por módulo). Cada registro muestra su
**historial de cambios** con el antes y el después de cada campo (en el `detalle` jsonb
de `auditoria`). Inmutabilidad y registro de accesos vienen de la Fase 11 (§5.9).

#### 6.4.4 Respaldo y exportación completa (Fase 18)

Según §5.8.

#### 6.4.5 Datos personales (Fase 11)

Aviso de tratamiento de datos personales (recomendación 12, Ley 1581 de 2012) al primer
ingreso, con aceptación registrada (usuario, fecha). El texto lo entrega la entidad y se
guarda en configuración. Perfil mínimo: usuario, nombre, correo institucional, cargo;
sin documento de identidad ni datos sensibles.

## 7. Modelo de datos (vista general)

Las 16 tablas existentes se conservan. Los nombres de abajo son **provisionales**: cada
spec de fase fija columnas, índices y restricciones. Convenciones heredadas que siguen:
`timestamptz`, claves foráneas con `restrict` (nada con historia se borra, D47), CHECK de
estados en BD, migraciones versionadas con Drizzle Kit, índices por `proceso_id` en todo
lo que filtra `alcance()`.

**Cambios a tablas existentes**

| Tabla | Cambio |
|---|---|
| `usuarios` | rol, correo y su verificación, `cargo_id`, `jefe_inmediato_id`, debe cambiar clave, intentos fallidos y bloqueo, secreto TOTP y códigos de recuperación, permiso "ver historial completo", tema preferido, aceptación del aviso de datos |
| `documentos` | nivel de acceso; campos de documento externo (entidad emisora, versión adoptada, fecha de adopción); meses de revisión y próxima revisión |
| `documento_versiones` | etapa del flujo y fechas por etapa (o tabla de pasos); las versiones que pasan por el flujo referencian usuarios y `firmas`; las columnas de texto `elaboro/reviso/aprobo` se conservan (nullable) para la carga histórica y los datos heredados, con la marca "aprobación registrada fuera de la plataforma" |
| `tipos_documento` | meses de revisión por defecto, rol o cargo que aprueba |
| `archivos` | contexto dueño (documento, medición, actividad, hallazgo) |
| `eventos_consulta` | `usuario_id` además de IP y user-agent |
| `auditoria` | sin cambio de forma; `detalle` lleva antes/después; protegida contra UPDATE/DELETE |
| `configuracion` | claves nuevas de marca y parámetros |

**Tablas nuevas por fase**

| Fase | Tablas |
|---|---|
| 11 | `usuario_procesos`, `areas`, `cargos`, `accesos`, `tokens_un_uso` (activación, restablecimiento, verificación de correo) |
| 12 | `notificaciones` |
| 13 | `solicitudes_cambio`, `flujo_pasos`, `firmas`, `listas_distribucion`, `lista_miembros`, `acuses_lectura`, `copias_controladas`, `normas`, `norma_relaciones`, `norma_procesos`, `norma_documentos`, `caracterizaciones` |
| 14 | `tipos_indicador`, `indicadores`, `indicador_versiones`, `variables`, `indicador_variables`, `dimensiones`, `categorias`, `valores_variable`, `metas`, `mediciones`, `indicador_usuarios` |
| 15 | `objetivos_institucionales`, `planes`, `hallazgos`, `acciones`, `actividades`, `avances`, `verificaciones`, `hallazgo_reincidencias` |
| 16 | `correos`, `trabajos` |
| 17 | `fotos_tablero`, `revisiones_direccion`, `revision_decisiones` |
| 18 | `respaldos`, `pruebas_restauracion`, `exportaciones` |

## 8. Fases 11 a 20

Orden aprobado por el usuario. Cada fase termina en algo demostrable, con sus criterios
de seguridad y su capítulo del manual de usuario escrito mientras la funcionalidad está
fresca (el manual se ensambla en la 20). Cada fase arranca con su spec y su plan, como
hasta ahora.

### Fase 11 — Fundación de acceso

- **Alcance:** subir Next a 16.3.x antes de todo; adoptar `zod`; roles y
  `usuario_procesos`; áreas y cargos con jerarquía; CRUD de usuarios y alta por lote
  desde plantilla, con clave temporal, cambio obligatorio, política de clave, bloqueo por cuenta, TOTP opcional y
  `EXIGIR_2FA_ROLES`, sesiones activas con cierre forzado; registro de accesos; aviso de
  datos personales; login en toda la app (proxy y layouts); `permisos.ts` y `alcance()`
  con tests por celda y por rol; dos roles de BD y bitácora inmutable; `eventos_consulta`
  con usuario; reescritura de los tests heredados para el rol consulta; semilla mínima y
  demo (usuarios de ejemplo por rol); reescritura de la sección de hardware de
  `AGENTS.md` y de la fila de auth del stack.
- **Demostración:** crear cargos y cinco usuarios (uno por rol) y cargar veinte más
  desde la plantilla, con dos filas inválidas rechazadas; ingresar con cada rol y ver
  solo lo que permite; el líder solo ve sus procesos; cinco fallos bloquean la
  cuenta y quedan en accesos; activar TOTP con una app de autenticación; cerrar una
  sesión ajena desde el admin.
- **Seguridad:** riesgos 3, 4, 5, 7, 9, 10, 11, 15, 18, 19 de §5.9.
- **Manual:** "Ingreso, clave y segundo factor"; "Usuarios, cargos y procesos".

### Fase 12 — Nueva estructura visual

- **Alcance:** cascarón de la app según §5.11: barra lateral por módulos y rol, barra
  superior con búsqueda global `Ctrl K`, campana y menú de usuario con tema; tokens de
  marca, módulo y estado; tema oscuro; pantalla de configuración de marca con validación
  AA; componentes base (tablas, formularios, insignias de estado, tarjetas de cifras,
  gráficas base); campana y "mis tareas" montados aunque todavía vacíos; migración de
  todas las pantallas existentes (mapa, procesos, documentos, búsqueda, panel) al
  cascarón. El pulido fino queda para la 19.
- **Demostración:** cambiar nombre, logo y colores de la entidad y verlos aplicados;
  un color sin contraste es rechazado; alternar claro/oscuro; navegar con cada rol;
  buscar con `Ctrl K`.
- **Seguridad:** la subida del logo pasa por la validación de archivos; riesgo 8.
- **Manual:** "Conocer la plataforma"; "Configurar la marca de la entidad".

### Fase 13 — Documentación SGC

- **Alcance:** §6.1 completo, salvo el correo (16) y el botón "abrir acción" (15).
- **Demostración:** un documento recorre solicitud, elaboración, revisión con
  devolución, aprobación firmada y publicación con acta; la versión anterior queda
  obsoleta y solo la ve quien tiene permiso; registrar una copia controlada y ver la
  tarea de recogerla al publicar la siguiente; acusar lectura y ver el porcentaje del
  proceso; cargar tres normas y generar el normograma del proceso; un documento externo
  y uno restringido; dar de baja con aprobación; descargar un PDF con el nombre del
  usuario en la marca de agua; semáforo documental en la lista.
- **Seguridad:** riesgos 3, 4, 7, 14, 15, 20; firma con reautenticación.
- **Manual:** "Documentos: solicitar, elaborar, revisar, aprobar y publicar";
  "Normograma"; "Copias controladas y acuses de lectura".

### Fase 14 — Indicadores

- **Alcance:** §6.2 completo, salvo correo (16) y acción desde el rojo (15).
- **Demostración:** crear un indicador con dos variables compartidas y probar la
  fórmula; programar metas; reportar dos periodos, uno en rojo; ver semáforo y gráfica
  con hueco en el periodo sin dato; cerrar el periodo y corregir con justificación; un
  indicador regulatorio enlazado a una norma del normograma; un usuario designado
  reporta sin ser líder.
- **Seguridad:** riesgos 3, 4, 7, 15, 20; el intérprete de fórmulas con pruebas de
  entradas hostiles.
- **Manual:** "Indicadores: ficha técnica, reporte y análisis".

### Fase 15 — Planes de mejoramiento

- **Alcance:** §6.3 y §5.4 completos; conexión de "abrir acción" desde documento,
  proceso e indicador rojo; reportes básicos por plan, origen, área y proceso.
- **Demostración:** registrar un plan de auditoría interna con dos hallazgos; el líder
  rechaza uno con justificación y acepta otro; análisis de causas, acciones de dos tipos,
  actividades con avance y evidencias; Control Interno verifica, uno eficaz y uno
  reabierto; un hallazgo de ente externo que no se puede rechazar; marcar reincidencia;
  abrir una acción desde un indicador en rojo; exportar el formato Contraloría básico.
- **Seguridad:** riesgos 3, 4, 7, 15, 20; separación ejecuta/verifica probada.
- **Manual:** "Planes de mejoramiento: hallazgos, acciones y verificación".

### Fase 16 — Notificaciones y planificador

- **Alcance:** §5.6 y §5.7: planificador con tabla de trabajos, cola de correo con
  reintentos, resumen diario, inmediatas, escalamiento, recordatorios de pasos del
  flujo, fechas de corte y actividades vencidas, verificación de correo, "olvidé mi
  clave" por correo, correo de prueba, pantalla de estado del canal.
- **Demostración:** con un SMTP de pruebas en desarrollo (Mailpit) ver el resumen
  diario, una alerta inmediata por indicador rojo y un escalamiento al supervisor; sin
  SMTP, todo sigue llegando a la campana; la cola reintenta cuando el SMTP vuelve.
- **Seguridad:** riesgo 13; enlaces de un solo uso con vencimiento; sin contenido de
  documentos en los correos.
- **Manual:** "Avisos y correo". Manual técnico: "Configurar el correo institucional".

### Fase 17 — Tablero gerencial y reportes

- **Alcance:** §6.4.1 y §6.4.2: tablero por rol con cuatro franjas y matriz de
  pendientes, foto mensual, informe de revisión por la dirección con decisiones que se
  vuelven acciones, catálogo de reportes en Excel y PDF con pie de control y auditoría de
  exportación.
- **Demostración:** entrar como Gerencia y leer el estado institucional en una pantalla;
  como líder, solo sus procesos; generar el informe de revisión por la dirección de un
  periodo con datos de los tres módulos y registrar dos decisiones; exportar tres
  reportes y ver el pie de control y la bitácora.
- **Seguridad:** los reportes respetan `alcance()`; saneo de fórmulas en Excel (D54) en
  todos los reportes.
- **Manual:** "Tablero gerencial"; "Reportes"; "Revisión por la dirección".

### Fase 18 — Trazabilidad, exportación completa y respaldos

- **Alcance:** §6.4.3 y §5.8: bitácora unificada con filtros por módulo, historial
  antes/después en cada ficha, exportación completa en segundo plano, respaldo diario
  cifrado desde la app, vigilancia de 26 horas, script de restauración, prueba de
  restauración registrada.
- **Demostración:** cambiar un campo y ver el antes y el después; generar la exportación
  completa y abrir el ZIP; ver el respaldo del día en el tablero del admin y la alerta
  cuando se simula uno faltante; **restaurar en una base vacía** y comprobar conteos y
  archivos; registrar la prueba.
- **Seguridad:** respaldos cifrados, clave fuera del repositorio, descarga de
  exportación de un solo uso y auditada.
- **Manual:** "Bitácora e historial". Borrador del procedimiento de respaldo y
  restauración (se cierra en la 20 contra el servidor real).

### Fase 19 — Pulido visual, accesibilidad y auditoría de seguridad

- **Alcance:** pulido fino de todas las vistas en claro y oscuro; Lighthouse de
  accesibilidad en las vistas principales; recorrido por teclado; 390 px; revisión de
  los 20 riesgos con evidencia por fila; escaneo de secretos y `npm audit` en CI;
  cabeceras; dependencias al día; pruebas de abuso (IDOR entre procesos, fuerza bruta,
  archivos hostiles); revisión de los capítulos del manual.
- **Demostración:** tabla de los 20 riesgos con la evidencia de cada uno; Lighthouse de
  accesibilidad en 100 en las vistas clave; una sesión completa solo con teclado.
- **Manual:** revisión final de capítulos.

### Fase 20 — Despliegue y documentación

- **Alcance:** compose de producción (proxy, app, bd) con límites; CI publicando imagen
  `linux/amd64` (y `arm64` a mano); guías de instalación para Windows (WSL2) y Linux;
  generación de secretos; TLS; prueba de reinicio del servidor sin intervención; SMTP
  real; copia de respaldos fuera del servidor; restauración probada en el servidor;
  ensayo de **actualización desde un respaldo de `sgc-suaza`** (restaurar y arrancar,
  §4.1) con la base de la original, documentado en el manual técnico para el otro
  hospital; **manual de usuario** ensamblado, **manual técnico de administración** y
  **procedimiento de respaldo y restauración** terminados; entrega a sistemas.
- **Demostración:** la app arriba tras reiniciar el servidor del hospital; ingreso con
  TLS; un correo real recibido; restauración de un respaldo cifrado en el servidor;
  los tres documentos entregados.

## 9. Lo que se deja al constructor

Decisiones que una persona competente puede tomar dentro de cada fase sin volver al
usuario, respetando las restricciones de este documento:

- El esquema exacto de cada fase: nombres definitivos de tablas y columnas (los de §7
  son provisionales), índices, CHECKs, y si el flujo documental va como columnas o como
  tabla de pasos.
- Cómo se modela la pertenencia de los archivos (§5.5) y si las rutas de consulta se
  agrupan en un grupo de rutas.
- Si adelanta una versión mínima del planificador (§5.7) a la Fase 13 para las alertas
  de vencimiento, o las calcula al cargar la página hasta la Fase 16.
- La estructura de URL de los módulos nuevos, manteniendo las existentes.
- El diseño de cada pantalla y formulario dentro del sistema visual de §5.11, y los
  textos de interfaz, correos, estados vacíos y errores.
- La gramática completa y las funciones del intérprete de fórmulas, y su manejo de
  precisión.
- La tabla de transiciones del flujo documental y del hallazgo, con quién puede ejecutar
  cada transición, dentro de las reglas de separación de funciones.
- Librerías concretas: la de TOTP (JS puro, sin binarios nativos), la de SMTP
  (`nodemailer` salvo razón en contra), la versión de `zod`.
- El formato interno de la foto mensual y del ZIP de exportación completa.
- La lista exacta de columnas de cada reporte y la diagramación de los PDF.
- Los límites de recursos del compose de producción (se fijan contra el servidor real).
- El orden interno de tareas, los tests y los datos de la semilla demo de cada fase.

## 10. Decisiones de Claude en este documento (para revisar de una vez)

| # | Decisión | Dónde | Por qué |
|---|---|---|---|
| DC1 | Caddy como proxy TLS, tercer contenedor | §4.1 | TLS automático, configuración de diez líneas, misma imagen en Windows y Linux |
| DC2 | En Windows, Docker Engine dentro de WSL2, no Docker Desktop | §4.1 | Arranca sin sesión de usuario; sin licencia de pago |
| DC3 | `amd64` en cada versión, `arm64` bajo demanda | §4.1 | El destino es x86; el NAS deja de ser el caso principal |
| DC4 | `zod` para validar entradas | §5.9 | JS puro, esquemas estrictos que resuelven los riesgos 7 y 15 a la vez |
| DC5 | `nodemailer` para SMTP | §5.6 | JS puro, estándar de facto |
| DC6 | TOTP opcional, exigible por rol con `EXIGIR_2FA_ROLES` | §5.1 | Funciona sin internet ni correo; se endurece cuando se exponga |
| DC7 | Sin caducidad periódica de claves | §5.1 | NIST SP 800-63B; la protección viene del bloqueo, la lista de comunes y el TOTP |
| DC8 | Bloqueo por cuenta (5 fallos, 15 min, duplicando); límite por IP laxo | §5.1, §5.9 | Todo el hospital puede salir por una sola IP |
| DC9 | Dos Admin SGC: advertencia, no bloqueo | §5.1 | No trabar una instalación nueva |
| DC10 | Permiso individual "ver historial completo" sobre el rol base | §5.3 | Es lo que pide 1.6 sin crear un rol más |
| DC11 | Rol aprobador configurable por tipo de documento; sugerencia del superior del elaborador | §6.1 | Gerencia no aprueba un formato de laboratorio; el tipo lo decide |
| DC12 | Caracterización editable con historial, no versionada | §6.1 | El usuario rechazó la adición 10 |
| DC13 | Tres marcas de agua distintas (no controlada con usuario, controlada numerada, en trámite) | §6.1 | La adición 1 y la 8 pedían cosas distintas de la misma marca |
| DC14 | "Mis tareas" se calcula; las notificaciones se almacenan | §5.6 | Evita duplicar estado |
| DC15 | Planificador dentro de la app con tabla de trabajos | §5.7 | Sin cuarto contenedor; igual en ambos sistemas |
| DC16 | Respaldo ejecutado por la app con `pg_dump` y cifrado AES-256-GCM | §5.8 | Independiente del sistema operativo; vigilancia gratis |
| DC17 | Zona horaria por instalación, `America/Bogota` por defecto | §4.1 | Cortes, periodos y resúmenes dependen de ella |
| DC18 | Semilla mínima separada de la demo | §5.10 | Varias entidades |
| DC19 | Logo en PNG, WebP o JPG; sin SVG | §5.10 | Vector de XSS |
| DC20 | Subir Next al inicio de la Fase 11 | §5.9 | Antes de escribir código nuevo sobre una versión con avisos |
| DC21 | Campana y "mis tareas" montados en la Fase 12, alimentados desde la 13 | §8 | Los módulos nacen dentro del cascarón definitivo |
| DC22 | Escalamiento a 3 días; atención documental a 90 días | §5.6, §6.1 | Valores iniciales configurables |
| DC23 | Sin meta programada: se mide, no se semaforiza | §6.2 | Evita un rojo falso |
| DC24 | Supervisor de 3.4 = superior del cargo o jefe inmediato | §6.3 | Consecuencia de la jerarquía aprobada |
| DC25 | Las URL existentes se conservan detrás del ingreso | §5.1 | Marcadores y enlaces de los funcionarios siguen sirviendo |
| DC26 | Carga histórica por publicación directa, marcada, sin acta; la siguiente versión pasa por el flujo | §6.1 | Unos 200 documentos aprobados en papel no pueden recorrer un flujo de cuatro firmas |
| DC27 | Separación de funciones: dos reglas duras (elabora ≠ aprueba, ejecuta ≠ verifica); publicar no es aprobar | §5.1 | Un solo Admin SGC no bloquea la publicación |
| DC28 | Cierre de sesión por inactividad, 60 minutos por defecto | §5.1 | Equipos compartidos en el hospital |
| DC29 | Migraciones aplicables sobre una base de `sgc-suaza`; migrar es restaurar y arrancar | §4.1 | Continuidad si la original opera en el ínterin |
| DC30 | Retirada la fila "Evidencias de procesos" de la matriz | §5.1 | Residuo de la primera propuesta; el usuario confirmó que SOGC no entra como contenido; las evidencias viven en mediciones y actividades |
| DC31 | Alta de usuarios por lote desde plantilla, además de una por una | §5.1 | Cuenta personal para toda la planta; el rechazo del usuario a la carga masiva fue para mediciones, no para cuentas |
| DC32 | La Fase 20 ensaya la actualización desde un respaldo de `sgc-suaza` | §8 | La original se instalará en otro hospital; ese es su camino a SGC Integral |

## 11. Pendientes externos (dependen del usuario o de sistemas)

- Confirmar si desde el servidor se alcanza el **SMTP institucional** (host, puerto,
  cuenta remitente, autenticación).
- **Versión de Windows** del servidor y si la virtualización está habilitada (decide
  WSL2 frente a máquina virtual). Recursos del servidor.
- Decisión de **exposición a internet** y, si aplica, dominio y quién gestiona el DNS.
- **Planta de cargos** vigente y lista de áreas (semilla de §5.2).
- **Objetivos institucionales** del plan de desarrollo (semilla de §6.3).
- **Texto del aviso de tratamiento de datos personales** de la entidad.
- Tipos de indicador y lista inicial de indicadores regulatorios que la entidad reporta.
- **Formato actual del plan de mejoramiento** que Control Interno entrega a Contraloría y
  Supersalud (la plantilla real, en Excel o Word), antes de la spec de la Fase 15: fija
  columnas de hallazgos, acciones y actividades.
- Número total de funcionarios que tendrán cuenta ("más de 40" es el piso; todos con
  cuenta personal) y la planta en el formato de la plantilla de alta por lote.
- Heredados: convención oficial de códigos de documentos, documentos reales aprobados,
  logo institucional en alta resolución.
- Crear el repositorio `juanfyru/sgc-integral` en GitHub y hacer el primer push
  (pendiente desde la bifurcación).

## 12. Riesgos principales y mitigación

| Riesgo | Mitigación |
|---|---|
| Poner login en toda la app rompe comportamientos heredados silenciosamente | Los tests públicos se reescriben para el rol consulta en la Fase 11, antes de cualquier módulo; la demostración de la fase incluye el recorrido de consulta completo |
| El flujo documental con firmas resulta pesado para 40 usuarios y lo esquivan | Los pasos se designan por documento y el Admin puede asignarse revisión y publicación; la demostración de la Fase 13 mide cuántos clics toma publicar un formato simple |
| El servidor Windows no soporta WSL2 o sistemas no lo opera | Confirmar versión antes de la Fase 20; alternativa de máquina virtual Linux documentada; prueba de reinicio como criterio de aceptación |
| SMTP nunca se confirma | Todo funciona por campana; el correo se activa por variables de entorno sin tocar código |
| Pérdida de `RESPALDO_CLAVE` deja los respaldos ilegibles | Custodia doble documentada; la prueba semestral usa la clave custodiada |
| Alcance de diez fases se diluye | Cada fase cierra con demostración, `CONTEXT.md` y capítulo del manual; ninguna arranca sin cerrar la anterior |
| Fórmulas de indicadores con casos no previstos | Intérprete propio con pruebas de entradas hostiles y "sin dato" explícito; el Admin prueba la fórmula al guardar |
| La carga histórica se usa para esquivar el flujo de aprobación | Restringida a Admin SGC, auditada, marcada en cada versión y en el Listado Maestro; desactivable por configuración al terminar la carga inicial |
| El rediseño se queda en "bonito" sin significado | El color sigue el sistema de tres capas de §5.11; el validador de paleta corre en claro y oscuro; estado siempre con texto o ícono |
